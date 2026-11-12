import { describe, expect, it } from "vitest";
import { NearBlocksIndexer, verifyContractCall, type ContractCallDef, type TxIndexer } from "./contract-call";
import { RpcError, type NearRpc, type TxOutcome } from "./rpc";

const H = (c: string) => c.repeat(44); // valid-looking base58 hash
const TX = H("A");
const TX2 = H("B");
const def: ContractCallDef = { type: "near_contract_call", network: "testnet", contractId: "nft.district.testnet", methodName: "nft_mint", title: "Mint the badge" };
const window = { windowStart: new Date("2026-11-10T00:00:00Z"), windowEnd: new Date("2026-11-20T00:00:00Z"), now: new Date("2026-11-12T00:00:00Z") };
const blockTime = async () => ({ height: 100, time: new Date("2026-11-12T00:00:00Z") });

function outcome(over: { hash?: string; signer?: string; receiver?: string; method?: string; failed?: boolean; downstreamFailed?: boolean } = {}): TxOutcome {
  return {
    final_execution_status: "FINAL",
    status: over.failed ? { Failure: { ActionError: {} } } : { SuccessValue: "" },
    transaction: {
      hash: over.hash ?? TX,
      signer_id: over.signer ?? "alice.testnet",
      receiver_id: over.receiver ?? "nft.district.testnet",
      actions: [{ FunctionCall: { method_name: over.method ?? "nft_mint", args: "", gas: 1, deposit: "0" } }],
    },
    transaction_outcome: { id: "t1", block_hash: "b0", outcome: { logs: [], executor_id: "alice.testnet", receipt_ids: ["r1"], status: { SuccessReceiptId: "r1" } } },
    receipts_outcome: [
      { id: "r1", block_hash: "b1", outcome: { logs: [], executor_id: "nft.district.testnet", status: over.failed ? { Failure: {} } : { SuccessValue: "" } } },
      { id: "r2", block_hash: "b2", outcome: { logs: [], executor_id: "alice.testnet", status: over.downstreamFailed ? { Failure: {} } : { SuccessValue: "" } } },
    ],
  };
}

function rpcWith(map: Record<string, TxOutcome>): NearRpc {
  return {
    txStatus: async (hash: string) => {
      const o = map[hash];
      if (!o) throw new RpcError("UNKNOWN_TRANSACTION", undefined, false);
      return o;
    },
  } as unknown as NearRpc;
}
const indexerWith = (hashes: string[]): TxIndexer => ({ recentTransactions: async () => hashes });
const run = (rpc: NearRpc, input: { txHash?: string; exclude?: string[]; wallets?: string[] }, indexer: TxIndexer | null = null, d: ContractCallDef = def) =>
  verifyContractCall({ rpc, indexer, network: "testnet", blockTime }, d, { txHash: input.txHash ?? "", wallets: input.wallets ?? ["alice.testnet"], exclude: input.exclude, ...window });

describe("near_contract_call verification", () => {
  it("verifies a direct, successful call by the player's wallet", async () => {
    const v = await run(rpcWith({ [TX]: outcome() }), { txHash: TX });
    expect(v.status).toBe("verified");
    if (v.status === "verified") expect(v.evidence).toMatchObject({ txHash: TX, signer: "alice.testnet", protocolContract: "nft.district.testnet", receiptId: "r1", detail: { methodName: "nft_mint" } });
  });

  it("discovers the transaction through the indexer, then proves it via RPC", async () => {
    const v = await run(rpcWith({ [TX2]: outcome({ hash: TX2 }) }), {}, indexerWith([TX2]));
    expect(v.status).toBe("verified");
  });

  it("rejects a call to the wrong contract", async () => {
    expect(await run(rpcWith({ [TX]: outcome({ receiver: "other.testnet" }) }), { txHash: TX })).toMatchObject({ status: "failed", reason: "wrong_contract" });
  });

  it("rejects a call to the wrong method", async () => {
    expect(await run(rpcWith({ [TX]: outcome({ method: "nft_transfer" }) }), { txHash: TX })).toMatchObject({ status: "failed", reason: "wrong_method" });
  });

  it("rejects failed transactions, including failed downstream receipts", async () => {
    expect(await run(rpcWith({ [TX]: outcome({ failed: true }) }), { txHash: TX })).toMatchObject({ status: "failed", reason: "transaction_failed" });
    expect(await run(rpcWith({ [TX]: outcome({ downstreamFailed: true }) }), { txHash: TX })).toMatchObject({ status: "failed", reason: "transaction_failed" });
  });

  it("rejects transactions signed by someone else", async () => {
    expect(await run(rpcWith({ [TX]: outcome({ signer: "mallory.testnet" }) }), { txHash: TX })).toMatchObject({ status: "failed", reason: "signer_not_verified_wallet" });
  });

  it("never counts the same transaction twice", async () => {
    const rpc = rpcWith({ [TX]: outcome() });
    expect(await run(rpc, { txHash: TX, exclude: [TX] })).toMatchObject({ status: "failed", reason: "evidence_reused" });
    expect(await run(rpc, { exclude: [TX] }, indexerWith([TX]))).toMatchObject({ status: "failed", reason: "not_found" });
  });

  it("reports not_found when the wallet has no matching transaction", async () => {
    expect(await run(rpcWith({}), {}, indexerWith([]))).toMatchObject({ status: "failed", reason: "not_found" });
  });

  it("rejects calls made outside the mission window", async () => {
    const late = verifyContractCall({ rpc: rpcWith({ [TX]: outcome() }), indexer: null, network: "testnet", blockTime: async () => ({ height: 1, time: new Date("2026-12-01T00:00:00Z") }) }, def, { txHash: TX, wallets: ["alice.testnet"], ...window });
    expect(await late).toMatchObject({ status: "failed", reason: "outside_time_window" });
  });

  it("stays pending (not failed) when the indexer is down or the tx is not final", async () => {
    const down: TxIndexer = { recentTransactions: async () => { throw new Error("503"); } };
    expect((await run(rpcWith({}), {}, down)).status).toBe("pending");
    expect((await run(rpcWith({ [TX]: { ...outcome(), final_execution_status: "EXECUTED_OPTIMISTIC" } }), { txHash: TX })).status).toBe("pending");
  });

  it("refuses a definition for another network", async () => {
    expect(await run(rpcWith({ [TX]: outcome() }), { txHash: TX }, null, { ...def, network: "mainnet" })).toMatchObject({ status: "failed", reason: "network_mismatch" });
  });

  it("NearBlocks indexer keeps only well-formed hashes to the contract since the window start", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { transaction_hash: TX, receiver_account_id: "nft.district.testnet", block_timestamp: "1762905600000000000" }, // 2025-11-12: before window
            { transaction_hash: TX2, signer_account_id: "alice.testnet", receiver_account_id: "nft.district.testnet", block_timestamp: String(BigInt(Date.parse("2026-11-12T00:00:00Z")) * 1_000_000n) },
            { transaction_hash: H("C"), receiver_account_id: "other.testnet", block_timestamp: String(BigInt(Date.parse("2026-11-12T00:00:00Z")) * 1_000_000n) },
            { transaction_hash: "not-a-hash", receiver_account_id: "nft.district.testnet" },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const got = await new NearBlocksIndexer({ fetchImpl }).recentTransactions("alice.testnet", { network: "testnet", receiver: "nft.district.testnet", since: window.windowStart, limit: 50 });
    expect(got).toEqual([TX2]);
  });
});
