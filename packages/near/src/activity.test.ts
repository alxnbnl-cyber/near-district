/**
 * On-chain activity verification against REAL finalized mainnet outcomes (fixtures captured
 * 2026-11-09 via `tx` with wait_until FINAL). Only the transport is faked.
 */
import { describe, expect, it } from "vitest";
import { NearRpc, type TxOutcome } from "./rpc";
import { decodeBurrowDeposits, decodeRheaSwaps, NearActivityVerifier } from "./activity";
import swapFx from "./fixtures/rhea-swap-mainnet.json";
import depFx from "./fixtures/burrow-deposit-mainnet.json";
import blocksFx from "./fixtures/blocks-mainnet.json";

const USDC = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const SWAP_TX = "Fdp7vhmYxNeG8hiif3XP9zGYuzxp3YTX9p9XWrhaKswf";
const DEP_TX = "8wXH3rW9i43VUMmiN9oH7bQ6wWNdD7oxC4iLs4hSoRP1";
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

interface FakeChain {
  txs: Record<string, TxOutcome>;
  positions?: Record<string, { supplied?: { token_id: string; balance: string }[]; collateral?: { token_id: string; balance: string }[] }>;
  httpStatus?: number;
  finalStatus?: string;
}

function fakeRpc(chain: FakeChain) {
  const fetchImpl = (async (_url: string, init: { body: string }) => {
    if (chain.httpStatus) return new Response("", { status: chain.httpStatus });
    const { method, params } = JSON.parse(init.body);
    let result: unknown;
    if (method === "tx") {
      const o = chain.txs[params.tx_hash];
      if (!o) return Response.json({ error: { message: "Transaction doesn't exist", cause: { name: "UNKNOWN_TRANSACTION" } } });
      result = { ...o, final_execution_status: chain.finalStatus ?? "FINAL" };
    } else if (method === "block") {
      const b = (blocksFx as Record<string, { height: number; timestamp: string }>)[params.block_id];
      result = { header: { height: b!.height, timestamp_nanosec: b!.timestamp } };
    } else if (method === "query") {
      const args = JSON.parse(Buffer.from(params.args_base64, "base64").toString());
      let value: unknown = null;
      if (params.method_name === "get_asset") value = args.token_id === USDC ? { config: { extra_decimals: 12 } } : null;
      if (params.method_name === "get_account") value = chain.positions?.[args.account_id] ?? null;
      result = { result: [...Buffer.from(JSON.stringify(value))], block_height: 1 };
    }
    return Response.json({ jsonrpc: "2.0", id: 1, result });
  }) as unknown as typeof fetch;
  return new NearRpc({ urls: ["http://rpc.test"], fetchImpl });
}

const swapOutcome = swapFx as unknown as TxOutcome;
const depOutcome = depFx as unknown as TxOutcome;
const window = { windowStart: new Date("2026-11-01T00:00:00Z"), windowEnd: new Date("2026-12-01T00:00:00Z") };

describe("decoders (real mainnet logs)", () => {
  it("reads the RHEA swap log only from the exchange's successful receipt", () => {
    const hops = decodeRheaSwaps(swapOutcome);
    expect(hops).toHaveLength(1);
    expect(hops[0]).toMatchObject({ tokenIn: "zec.omft.near", amountIn: 1_200_000n, tokenOut: "wrap.near", amountOut: 4136983635846078001539158n });
  });

  it("reads the NEP-297 burrow deposit event", () => {
    const d = decodeBurrowDeposits(depOutcome);
    expect(d).toEqual([expect.objectContaining({ accountId: "u_suck.near", tokenId: USDC, amountInternal: 12019334680000000000000n })]);
  });

  it("ignores identical logs from any other contract", () => {
    const forged = clone(depOutcome);
    const burrow = forged.receipts_outcome.find((r) => r.outcome.executor_id === "contract.main.burrow.near")!;
    forged.receipts_outcome.push({ ...clone(burrow), id: "forged", outcome: { ...clone(burrow.outcome), executor_id: "evil.near" } });
    const swap = clone(swapOutcome);
    swap.receipts_outcome.forEach((r) => (r.outcome.executor_id = r.outcome.executor_id === "v2.ref-finance.near" ? "fake-ref.near" : r.outcome.executor_id));
    expect(decodeBurrowDeposits(forged)).toHaveLength(1);
    expect(decodeRheaSwaps(swap)).toHaveLength(0);
  });

  it("never counts a failed receipt", () => {
    const failed = clone(swapOutcome);
    const r = failed.receipts_outcome.find((x) => x.outcome.executor_id === "v2.ref-finance.near")!;
    r.outcome.status = { Failure: { ActionError: { kind: "FunctionCallError" } } };
    expect(decodeRheaSwaps(failed)).toHaveLength(0);
  });
});

describe("RHEA swap verifier", () => {
  const v = () => new NearActivityVerifier(fakeRpc({ txs: { [SWAP_TX]: swapOutcome } }));
  const def = { type: "near_rhea_swap" as const, network: "mainnet" as const, tokenIn: "zec.omft.near", tokenOut: "wrap.near", minAmountIn: "1200000" };

  it("verifies a matching swap from the signer's verified wallet", async () => {
    const r = await v().verifySwap(def, { txHash: SWAP_TX, wallets: ["closemeat6237.near"], ...window });
    expect(r.status).toBe("verified");
    if (r.status === "verified") expect(r.evidence).toMatchObject({ signer: "closemeat6237.near", amount: "1200000", blockHeight: 223759534, protocolContract: "v2.ref-finance.near" });
  });

  it("rejects someone else's transaction", async () => {
    expect(await v().verifySwap(def, { txHash: SWAP_TX, wallets: ["me.near"], ...window })).toEqual({ status: "failed", reason: "signer_not_verified_wallet" });
  });

  it("rejects amount, token and time mismatches", async () => {
    const base = { txHash: SWAP_TX, wallets: ["closemeat6237.near"], ...window };
    expect(await v().verifySwap({ ...def, minAmountIn: "1200001" }, base)).toMatchObject({ reason: "swap_does_not_match_requirement" });
    expect(await v().verifySwap({ ...def, tokenOut: USDC }, base)).toMatchObject({ reason: "swap_does_not_match_requirement" });
    expect(await v().verifySwap(def, { ...base, windowStart: new Date("2026-11-10T00:00:00Z") })).toMatchObject({ reason: "outside_time_window" });
  });

  it("rejects a malformed hash and an unknown transaction", async () => {
    expect(await v().verifySwap(def, { txHash: "not-a-hash", wallets: ["closemeat6237.near"], ...window })).toMatchObject({ reason: "invalid_tx_hash" });
    expect(await v().verifySwap(def, { txHash: DEP_TX, wallets: ["closemeat6237.near"], ...window })).toMatchObject({ reason: "tx_not_found_for_wallet" });
  });

  it("stays pending (never verified) while not final or when RPC is down", async () => {
    const notFinal = new NearActivityVerifier(fakeRpc({ txs: { [SWAP_TX]: swapOutcome }, finalStatus: "EXECUTED_OPTIMISTIC" }));
    expect(await notFinal.verifySwap(def, { txHash: SWAP_TX, wallets: ["closemeat6237.near"], ...window })).toMatchObject({ status: "pending", reason: "not_final" });
    const down = new NearActivityVerifier(fakeRpc({ txs: {}, httpStatus: 503 }));
    expect(await down.verifySwap(def, { txHash: SWAP_TX, wallets: ["closemeat6237.near"], ...window })).toMatchObject({ status: "pending", reason: "rpc_unavailable" });
  });
});

describe("RHEA lending supply verifier", () => {
  const def = { type: "near_rhea_lending_supply" as const, network: "mainnet" as const, tokenId: USDC, minAmount: "12019334680" };
  const base = { txHash: DEP_TX, wallets: ["u_suck.near"], ...window };

  it("verifies the supplied amount scaled by live extra_decimals", async () => {
    const r = await new NearActivityVerifier(fakeRpc({ txs: { [DEP_TX]: depOutcome } })).verifyLendingSupply(def, base);
    expect(r).toMatchObject({ status: "verified", evidence: { amount: "12019334680", tokenId: USDC, signer: "u_suck.near" } });
  });

  it("rejects too-small supplies and other tokens", async () => {
    const v = new NearActivityVerifier(fakeRpc({ txs: { [DEP_TX]: depOutcome } }));
    expect(await v.verifyLendingSupply({ ...def, minAmount: "12019334681" }, base)).toMatchObject({ reason: "amount_below_minimum" });
    expect(await v.verifyLendingSupply({ ...def, tokenId: "usdt.tether-token.near" }, base)).toMatchObject({ status: "failed" });
  });

  it("waits for the holding period, then requires the position to still be there", async () => {
    const hold = { ...def, minHoldSeconds: 86_400 };
    const early = await new NearActivityVerifier(fakeRpc({ txs: { [DEP_TX]: depOutcome } })).verifyLendingSupply(hold, { ...base, now: new Date("2026-11-08T12:00:00Z") });
    expect(early).toMatchObject({ status: "pending", reason: "holding_period" });
    const later = { ...base, now: new Date("2026-11-20T00:00:00Z") };
    const withdrawn = new NearActivityVerifier(fakeRpc({ txs: { [DEP_TX]: depOutcome }, positions: { "u_suck.near": { collateral: [{ token_id: USDC, balance: "1000000000000000000" }] } } }));
    expect(await withdrawn.verifyLendingSupply(hold, later)).toMatchObject({ status: "failed", reason: "position_not_held" });
    const kept = new NearActivityVerifier(fakeRpc({ txs: { [DEP_TX]: depOutcome }, positions: { "u_suck.near": { collateral: [{ token_id: USDC, balance: "22033878463558924175646" }] } } }));
    expect(await kept.verifyLendingSupply(hold, later)).toMatchObject({ status: "verified" });
  });
});
