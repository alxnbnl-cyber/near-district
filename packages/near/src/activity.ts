/**
 * On-chain activity verification for hint unlocks.
 *
 * A transaction hash from a browser is only a pointer. Everything here is re-derived from the
 * FINAL transaction outcome fetched from our own RPC:
 *   - the signer must be one of the user's ownership-verified NEAR accounts,
 *   - the specific receipt carrying the evidence must have succeeded,
 *   - it must be executed by the approved protocol contract,
 *   - token contracts are matched exactly (never by symbol),
 *   - the receipt's block time must fall inside the requirement window.
 *
 * Formats verified against mainnet on 2026-11-09 (fixtures in ./fixtures):
 *   RHEA exchange (v2.ref-finance.near) logs  `Swapped <amount_in> <token_in> for <amount_out> <token_out>`
 *   RHEA lending  (contract.main.burrow.near) emits NEP-297
 *     EVENT_JSON:{"standard":"burrow","event":"deposit","data":[{"account_id","amount","token_id"}]}
 *   with `amount` in Burrow internal units (token decimals + extra_decimals).
 */
import { activityToken, RHEA_CONTRACTS, RHEA_MAINNET, STAKING_POOL_SUFFIXES, type ActivityDef, type ActivityNetwork } from "@yielvy/core";
import { RpcError, type NearRpc, type ReceiptOutcome, type TxOutcome } from "./rpc";
import { verifyContractCall, type ContractCallDef, type ContractCallInput, type TxIndexer } from "./contract-call";

export type OnchainVerdict =
  | { status: "verified"; evidence: OnchainEvidence }
  | { status: "pending"; reason: string; retryAt: Date }
  | { status: "failed"; reason: string };

export type OnchainEvidence = {
  provider: "near-rpc";
  network: string;
  txHash: string;
  receiptId: string;
  signer: string;
  blockHash: string;
  blockHeight: number;
  executedAt: string; // ISO, from the receipt's block header
  protocolContract: string;
  /** Verified amount in the smallest token unit (swap: amount in; lending: supplied). */
  amount: string;
  tokenId: string;
  detail: Record<string, string>;
};

export interface VerifyInput {
  txHash: string;
  /** NEAR accounts the user proved ownership of (NEP-413). */
  wallets: string[];
  windowStart: Date;
  windowEnd: Date;
  now?: Date;
}

const TX_HASH = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;

export function receiptSucceeded(r: ReceiptOutcome): boolean {
  const s = r.outcome.status;
  return s.Failure === undefined && (s.SuccessValue !== undefined || s.SuccessReceiptId !== undefined);
}

export interface SwapHop {
  receiptId: string;
  blockHash: string;
  logIndex: number;
  amountIn: bigint;
  tokenIn: string;
  amountOut: bigint;
  tokenOut: string;
}

const SWAP_LOG = /^Swapped (\d+) (\S+) for (\d+) (\S+)$/;

/** Swap hops from successful receipts executed by the exchange contract only. */
export function decodeRheaSwaps(o: TxOutcome, exchange: string = RHEA_MAINNET.exchange): SwapHop[] {
  const hops: SwapHop[] = [];
  for (const r of o.receipts_outcome) {
    if (r.outcome.executor_id !== exchange || !receiptSucceeded(r)) continue;
    r.outcome.logs.forEach((log, logIndex) => {
      const m = SWAP_LOG.exec(log.trim());
      if (m) hops.push({ receiptId: r.id, blockHash: r.block_hash, logIndex, amountIn: BigInt(m[1]!), tokenIn: m[2]!, amountOut: BigInt(m[3]!), tokenOut: m[4]! });
    });
  }
  return hops;
}

export interface BurrowDeposit {
  receiptId: string;
  blockHash: string;
  accountId: string;
  tokenId: string;
  /** Burrow internal units. */
  amountInternal: bigint;
}

/** NEP-297 burrow `deposit` events from successful receipts executed by the lending contract only. */
export function decodeBurrowDeposits(o: TxOutcome, lending: string = RHEA_MAINNET.lending): BurrowDeposit[] {
  const out: BurrowDeposit[] = [];
  for (const r of o.receipts_outcome) {
    if (r.outcome.executor_id !== lending || !receiptSucceeded(r)) continue;
    for (const log of r.outcome.logs) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      let ev: { standard?: string; event?: string; data?: { account_id?: string; amount?: string; token_id?: string }[] };
      try {
        ev = JSON.parse(log.slice("EVENT_JSON:".length));
      } catch {
        continue;
      }
      if (ev.standard !== "burrow" || ev.event !== "deposit" || !Array.isArray(ev.data)) continue;
      for (const d of ev.data) {
        if (typeof d.account_id === "string" && typeof d.token_id === "string" && typeof d.amount === "string" && /^\d+$/.test(d.amount)) {
          out.push({ receiptId: r.id, blockHash: r.block_hash, accountId: d.account_id, tokenId: d.token_id, amountInternal: BigInt(d.amount) });
        }
      }
    }
  }
  return out;
}

/** Does a sequence of hops (or a single hop) satisfy the swap requirement? */
export function matchSwap(def: Extract<ActivityDef, { type: "near_rhea_swap" }>, hops: SwapHop[]): SwapHop | null {
  const min = def.minAmountIn ? BigInt(def.minAmountIn) : 0n;
  const okIn = (h: SwapHop) => (!def.tokenIn || h.tokenIn === def.tokenIn) && h.amountIn >= min;
  // A single hop that matches both sides.
  for (const h of hops) if (okIn(h) && (!def.tokenOut || h.tokenOut === def.tokenOut)) return h;
  // A connected multi-hop route inside one receipt (A→B, B→C) matching first-in / last-out.
  const byReceipt = new Map<string, SwapHop[]>();
  for (const h of hops) byReceipt.set(h.receiptId, [...(byReceipt.get(h.receiptId) ?? []), h]);
  for (const route of byReceipt.values()) {
    if (route.length < 2) continue;
    const connected = route.every((h, i) => i === 0 || route[i - 1]!.tokenOut === h.tokenIn);
    if (connected && okIn(route[0]!) && (!def.tokenOut || route.at(-1)!.tokenOut === def.tokenOut)) return route[0]!;
  }
  return null;
}

export class NearActivityVerifier {
  constructor(
    private readonly rpc: NearRpc,
    private readonly contracts: { exchange: string; lending: string } = RHEA_MAINNET,
    private readonly network: ActivityNetwork = "mainnet",
  ) {}

  /** Verifier for a network's own RHEA contracts. */
  static forNetwork(rpc: NearRpc, network: ActivityNetwork) {
    return new NearActivityVerifier(rpc, RHEA_CONTRACTS[network], network);
  }

  /** Fetches the FINAL outcome, trying each verified wallet as the sender. */
  private async finalTx(input: VerifyInput): Promise<{ o: TxOutcome } | Exclude<OnchainVerdict, { status: "verified" }>> {
    const now = input.now ?? new Date();
    if (!TX_HASH.test(input.txHash)) return { status: "failed", reason: "invalid_tx_hash" };
    if (input.wallets.length === 0) return { status: "failed", reason: "no_verified_wallet" };
    let transient = false;
    for (const w of input.wallets) {
      try {
        const o = await this.rpc.txStatus(input.txHash, w);
        if (o.final_execution_status && o.final_execution_status !== "FINAL") return { status: "pending", reason: "not_final", retryAt: new Date(now.getTime() + 30_000) };
        if (!input.wallets.includes(o.transaction.signer_id)) return { status: "failed", reason: "signer_not_verified_wallet" };
        return { o };
      } catch (e) {
        if (e instanceof RpcError && e.retryable) transient = true;
        else if (!(e instanceof RpcError)) transient = true;
      }
    }
    return transient ? { status: "pending", reason: "rpc_unavailable", retryAt: new Date(now.getTime() + 60_000) } : { status: "failed", reason: "tx_not_found_for_wallet" };
  }

  /** Generic contract-function call; see ./contract-call. */
  verifyContractCall(def: ContractCallDef, input: ContractCallInput, indexer: TxIndexer | null, archive: NearRpc | null = null): Promise<OnchainVerdict> {
    const blockTime = async (h: string) => {
      try {
        return await this.blockInfo(h);
      } catch (e) {
        if (!archive) throw e;
        const b = await archive.call<{ header: { height: number; timestamp_nanosec: string } }>("block", { block_id: h });
        return { height: b.header.height, time: new Date(Number(BigInt(b.header.timestamp_nanosec) / 1_000_000n)) };
      }
    };
    return verifyContractCall({ rpc: this.rpc, archive, indexer, network: this.network, blockTime }, def, input);
  }

  async blockInfo(blockHash: string): Promise<{ height: number; time: Date }> {
    const b = await this.rpc.call<{ header: { height: number; timestamp_nanosec: string } }>("block", { block_id: blockHash });
    return { height: b.header.height, time: new Date(Number(BigInt(b.header.timestamp_nanosec) / 1_000_000n)) };
  }

  private inWindow(t: Date, input: VerifyInput) {
    return t >= input.windowStart && t <= input.windowEnd;
  }

  async verifySwap(def: Extract<ActivityDef, { type: "near_rhea_swap" }>, input: VerifyInput): Promise<OnchainVerdict> {
    const r = await this.finalTx(input);
    if (!("o" in r)) return r;
    const hops = decodeRheaSwaps(r.o, this.contracts.exchange);
    if (hops.length === 0) return { status: "failed", reason: "no_successful_rhea_swap" };
    const hit = matchSwap(def, hops);
    if (!hit) return { status: "failed", reason: "swap_does_not_match_requirement" };
    const block = await this.blockInfo(hit.blockHash);
    if (!this.inWindow(block.time, input)) return { status: "failed", reason: "outside_time_window" };
    return {
      status: "verified",
      evidence: {
        provider: "near-rpc",
        network: this.network,
        txHash: input.txHash,
        receiptId: hit.receiptId,
        signer: r.o.transaction.signer_id,
        blockHash: hit.blockHash,
        blockHeight: block.height,
        executedAt: block.time.toISOString(),
        protocolContract: this.contracts.exchange,
        amount: hit.amountIn.toString(),
        tokenId: hit.tokenIn,
        detail: { tokenOut: hit.tokenOut, amountOut: hit.amountOut.toString(), logIndex: String(hit.logIndex) },
      },
    };
  }

  /**
   * Staking with a validator: a successful receipt executed by a staking-pool account (factory suffix for this
   * network) logging "@<signer> staking <amount>." (near/core-contracts staking-pool).
   */
  async verifyStake(def: Extract<ActivityDef, { type: "near_stake" }>, input: VerifyInput): Promise<OnchainVerdict> {
    const r = await this.finalTx(input);
    if (!("o" in r)) return r;
    const signer = r.o.transaction.signer_id;
    const suffixes = STAKING_POOL_SUFFIXES[this.network];
    let total = 0n;
    let hit: { receiptId: string; blockHash: string; pool: string } | null = null;
    for (const rc of r.o.receipts_outcome) {
      const pool = rc.outcome.executor_id;
      if (!suffixes.some((sfx) => pool.endsWith(sfx)) || !receiptSucceeded(rc)) continue;
      for (const log of rc.outcome.logs) {
        const m = /^@(\S+) staking (\d+)\./.exec(log);
        if (m && m[1] === signer) {
          total += BigInt(m[2]!);
          hit ??= { receiptId: rc.id, blockHash: rc.block_hash, pool };
        }
      }
    }
    if (!hit) return { status: "failed", reason: "no_successful_stake" };
    if (total < BigInt(def.minAmount)) return { status: "failed", reason: "amount_below_minimum" };
    const block = await this.blockInfo(hit.blockHash);
    if (!this.inWindow(block.time, input)) return { status: "failed", reason: "outside_time_window" };
    return {
      status: "verified",
      evidence: {
        provider: "near-rpc",
        network: this.network,
        txHash: input.txHash,
        receiptId: hit.receiptId,
        signer,
        blockHash: hit.blockHash,
        blockHeight: block.height,
        executedAt: block.time.toISOString(),
        protocolContract: hit.pool,
        amount: total.toString(),
        tokenId: "near",
        detail: { pool: hit.pool },
      },
    };
  }

  async verifyLendingSupply(def: Extract<ActivityDef, { type: "near_rhea_lending_supply" }>, input: VerifyInput): Promise<OnchainVerdict> {
    const now = input.now ?? new Date();
    const token = activityToken(def.tokenId, this.network);
    if (!token || token.burrowExtraDecimals === null) return { status: "failed", reason: "token_not_supported" };
    const r = await this.finalTx(input);
    if (!("o" in r)) return r;
    const signer = r.o.transaction.signer_id;
    // Re-read extra_decimals live so a market config change can never mis-scale amounts.
    const asset = await this.rpc.view<{ config: { extra_decimals: number } } | null>(this.contracts.lending, "get_asset", { token_id: def.tokenId });
    if (!asset) return { status: "failed", reason: "token_not_listed_on_lending" };
    const scale = 10n ** BigInt(asset.config.extra_decimals);
    const deposits = decodeBurrowDeposits(r.o, this.contracts.lending).filter((d) => d.accountId === signer && d.tokenId === def.tokenId);
    if (deposits.length === 0) return { status: "failed", reason: "no_successful_lending_deposit" };
    const total = deposits.reduce((s, d) => s + d.amountInternal, 0n) / scale;
    if (total < BigInt(def.minAmount)) return { status: "failed", reason: "amount_below_minimum" };
    const first = deposits[0]!;
    const block = await this.blockInfo(first.blockHash);
    if (!this.inWindow(block.time, input)) return { status: "failed", reason: "outside_time_window" };
    if (def.minHoldSeconds) {
      const holdUntil = new Date(block.time.getTime() + def.minHoldSeconds * 1000);
      if (now < holdUntil) return { status: "pending", reason: "holding_period", retryAt: holdUntil };
      const held = (await this.currentPosition(signer, def.tokenId)) / scale;
      if (held < BigInt(def.minAmount)) return { status: "failed", reason: "position_not_held" };
    }
    return {
      status: "verified",
      evidence: {
        provider: "near-rpc",
        network: this.network,
        txHash: input.txHash,
        receiptId: first.receiptId,
        signer,
        blockHash: first.blockHash,
        blockHeight: block.height,
        executedAt: block.time.toISOString(),
        protocolContract: this.contracts.lending,
        amount: total.toString(),
        tokenId: def.tokenId,
        detail: { extraDecimals: String(asset.config.extra_decimals), ...(def.minHoldSeconds ? { heldFor: `${def.minHoldSeconds}s` } : {}) },
      },
    };
  }

  /** Supplied + collateral balance (internal units) for a token, at final finality. */
  async currentPosition(accountId: string, tokenId: string): Promise<bigint> {
    const acc = await this.rpc.view<{ supplied?: { token_id: string; balance: string }[]; collateral?: { token_id: string; balance: string }[] } | null>(
      this.contracts.lending,
      "get_account",
      { account_id: accountId },
    );
    if (!acc) return 0n;
    const sum = (xs?: { token_id: string; balance: string }[]) => (xs ?? []).filter((x) => x.token_id === tokenId).reduce((s, x) => s + BigInt(x.balance), 0n);
    return sum(acc.supplied) + sum(acc.collateral);
  }
}

/** Routes each on-chain (NEAR) activity type to its verifier; shared by the web app and the worker. */
export function dispatchOnchain(v: NearActivityVerifier, opts: { indexer?: TxIndexer | null; archive?: NearRpc | null } = {}) {
  return (def: ActivityDef, input: ContractCallInput): Promise<OnchainVerdict> =>
    def.type === "near_contract_call"
      ? v.verifyContractCall(def, input, opts.indexer ?? null, opts.archive ?? null)
      : def.type === "near_rhea_swap"
      ? v.verifySwap(def, input)
      : def.type === "near_rhea_lending_supply"
        ? v.verifyLendingSupply(def, input)
        : def.type === "near_stake"
          ? v.verifyStake(def, input)
          : Promise.resolve({ status: "failed", reason: "unsupported_activity" });
}
