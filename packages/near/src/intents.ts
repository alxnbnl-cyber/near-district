/**
 * NEAR Intents 1Click API client (https://docs.near-intents.org).
 *
 * Yielvy route (deliberately two-step, see docs/architecture/funding.md):
 *   external asset --1Click--> organizer's OWN NEAR account (USDC on NEAR)
 *   organizer --ft_transfer_call--> vault (native, sponsor-verified funding)
 * The vault never accepts unattributed plain transfers, so 1Click can never credit
 * the wrong campaign. Settlement is confirmed by polling 1Click status AND by reading
 * the organizer's USDC balance on NEAR before the native deposit step is offered.
 *
 * Verified live 2026-11-07: GET /v0/tokens (216 assets), POST /v0/quote dry run
 * base USDC -> NEAR USDC returned a signed quote (5.000000 -> 4.999001, ~35s).
 */
import { z } from "zod";

export const ONE_CLICK_BASE = "https://1click.chaindefuser.com";

export const tokenSchema = z.object({
  assetId: z.string(),
  decimals: z.number().int(),
  blockchain: z.string(),
  symbol: z.string(),
  price: z.number().optional(),
  priceUpdatedAt: z.string().optional(),
  contractAddress: z.string().optional(),
});
export type IntentsToken = z.infer<typeof tokenSchema>;

export const quoteResponseSchema = z.object({
  quote: z.object({
    amountIn: z.string(),
    amountInFormatted: z.string().optional(),
    amountOut: z.string(),
    amountOutFormatted: z.string().optional(),
    minAmountOut: z.string(),
    timeEstimate: z.number().optional(),
    depositAddress: z.string().optional(),
    depositMemo: z.string().optional(),
    deadline: z.string().optional(),
    timeWhenInactive: z.string().optional(),
    refundFee: z.string().optional(),
  }),
  quoteRequest: z.record(z.string(), z.unknown()),
  signature: z.string(),
  timestamp: z.string(),
  correlationId: z.string().optional(),
});
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;

/** Statuses returned by GET /v0/status. Anything else is treated as requiring review. */
export const INTENTS_STATUSES = [
  "KNOWN_DEPOSIT_TX",
  "PENDING_DEPOSIT",
  "INCOMPLETE_DEPOSIT",
  "PROCESSING",
  "SUCCESS",
  "REFUNDED",
  "FAILED",
] as const;
export type IntentsStatus = (typeof INTENTS_STATUSES)[number];

export const statusResponseSchema = z.object({
  status: z.string(),
  updatedAt: z.string().optional(),
  swapDetails: z
    .object({
      amountIn: z.string().optional().nullable(),
      amountOut: z.string().optional().nullable(),
      refundedAmount: z.string().optional().nullable(),
      originChainTxHashes: z.array(z.object({ hash: z.string(), explorerUrl: z.string().optional() })).optional(),
      destinationChainTxHashes: z.array(z.object({ hash: z.string(), explorerUrl: z.string().optional() })).optional(),
    })
    .partial()
    .optional(),
});
export type StatusResponse = z.infer<typeof statusResponseSchema>;

export interface QuoteInput {
  originAsset: string;
  destinationAsset: string;
  amount: bigint; // origin units, EXACT_INPUT
  refundTo: string;
  recipient: string; // organizer's NEAR account
  slippageBps: number;
  deadline: Date;
  dry: boolean;
}

export class OneClickClient {
  constructor(
    private readonly opts: { baseUrl?: string; jwt?: string; fetchImpl?: typeof fetch } = {},
  ) {}

  private async req<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.opts.jwt) headers.authorization = `Bearer ${this.opts.jwt}`;
    const res = await (this.opts.fetchImpl ?? fetch)(`${this.opts.baseUrl ?? ONE_CLICK_BASE}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new IntentsError(`1Click returned non-JSON (HTTP ${res.status})`, res.status);
    }
    if (!res.ok) {
      const msg = (body as { message?: string }).message ?? `HTTP ${res.status}`;
      throw new IntentsError(msg, res.status);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new IntentsError(`Unexpected 1Click response shape: ${parsed.error.message}`, res.status);
    return parsed.data;
  }

  tokens(): Promise<IntentsToken[]> {
    return this.req("/v0/tokens", { method: "GET" }, z.array(tokenSchema));
  }

  quote(q: QuoteInput): Promise<QuoteResponse> {
    if (q.slippageBps < 0 || q.slippageBps > 500) throw new IntentsError("Slippage must be between 0 and 5%", 400);
    return this.req(
      "/v0/quote",
      {
        method: "POST",
        body: JSON.stringify({
          dry: q.dry,
          swapType: "EXACT_INPUT",
          slippageTolerance: q.slippageBps,
          originAsset: q.originAsset,
          depositType: "ORIGIN_CHAIN",
          destinationAsset: q.destinationAsset,
          amount: q.amount.toString(),
          refundTo: q.refundTo,
          refundType: "ORIGIN_CHAIN",
          recipient: q.recipient,
          recipientType: "DESTINATION_CHAIN",
          deadline: q.deadline.toISOString(),
          quoteWaitingTimeMs: 3000,
        }),
      },
      quoteResponseSchema,
    );
  }

  status(depositAddress: string): Promise<StatusResponse> {
    return this.req(`/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`, { method: "GET" }, statusResponseSchema);
  }

  /** Optional speed-up: tells 1Click about the origin tx. Never treated as proof of payment. */
  submitDepositTx(txHash: string, depositAddress: string): Promise<unknown> {
    return this.req("/v0/deposit/submit", { method: "POST", body: JSON.stringify({ txHash, depositAddress }) }, z.unknown());
  }
}

export class IntentsError extends Error {
  constructor(message: string, readonly httpStatus: number) {
    super(message);
  }
}

/** Only offer routes that land on an allowlisted NEAR token. */
export function supportedOrigins(tokens: IntentsToken[], destinationAssetId: string, allowedSymbols = ["USDC"]): IntentsToken[] {
  const dest = tokens.find((t) => t.assetId === destinationAssetId);
  if (!dest) return [];
  return tokens.filter((t) => t.assetId !== destinationAssetId && allowedSymbols.includes(t.symbol) && t.blockchain !== "near");
}

export type FundingTransition =
  | { to: "AWAITING_PAYMENT" | "DETECTED" | "SETTLING" | "INCOMPLETE" | "REFUNDED" | "FAILED" | "REQUIRES_REVIEW"; reason?: string }
  | { to: "BRIDGED"; amountOut: bigint; destinationTx?: string }
  | null;

/** Maps a 1Click status to our funding state machine. Unknown statuses escalate. */
export function mapIntentsStatus(s: StatusResponse): FundingTransition {
  switch (s.status) {
    case "PENDING_DEPOSIT":
      return { to: "AWAITING_PAYMENT" };
    case "KNOWN_DEPOSIT_TX":
      return { to: "DETECTED" };
    case "PROCESSING":
      return { to: "SETTLING" };
    case "INCOMPLETE_DEPOSIT":
      return { to: "INCOMPLETE", reason: "The deposit was smaller than the quoted amount." };
    case "REFUNDED":
      return { to: "REFUNDED", reason: "1Click refunded the deposit to the origin address." };
    case "FAILED":
      return { to: "FAILED", reason: "1Click reported the swap as failed." };
    case "SUCCESS": {
      const out = s.swapDetails?.amountOut;
      if (!out || !/^\d+$/.test(out)) return { to: "REQUIRES_REVIEW", reason: "SUCCESS without a valid amountOut" };
      return { to: "BRIDGED", amountOut: BigInt(out), destinationTx: s.swapDetails?.destinationChainTxHashes?.[0]?.hash };
    }
    default:
      return { to: "REQUIRES_REVIEW", reason: `Unknown 1Click status ${s.status}` };
  }
}
