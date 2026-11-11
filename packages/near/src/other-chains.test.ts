import { describe, expect, it } from "vitest";
import { verifyEvmContractInteraction, verifySolanaProgramInteraction } from "./other-chains";

const window = { windowStart: new Date("2026-01-01"), windowEnd: new Date("2027-01-01"), now: new Date("2026-06-01") };
function fakeFetch(results: Record<string, unknown>): typeof fetch {
  return (async (_url: string, init: { body: string }) => {
    const { method } = JSON.parse(init.body) as { method: string };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: results[method] ?? null }));
  }) as unknown as typeof fetch;
}

describe("EVM contract interaction", () => {
  const me = "0x1111111111111111111111111111111111111111";
  const contract = "0x2222222222222222222222222222222222222222";
  const hash = "0x" + "a".repeat(64);
  const ok = {
    eth_getTransactionByHash: { from: me, to: contract, value: "0x0", blockNumber: "0x10" },
    eth_getTransactionReceipt: { status: "0x1", blockNumber: "0x10" },
    eth_getBlockByNumber: { timestamp: "0x" + Math.floor(Date.parse("2026-05-01") / 1000).toString(16), hash: "0xblock" },
  };
  const def = { type: "evm_contract_interaction" as const, chain: "base-sepolia" as const, contract };

  it("verifies a successful call from the proven wallet", async () => {
    const r = await verifyEvmContractInteraction(def, { txHash: hash, wallets: [me], ...window }, fakeFetch(ok));
    expect(r).toMatchObject({ status: "verified", evidence: { provider: "evm-rpc", network: "base-sepolia", signer: me } });
  });
  it("rejects another signer, another contract, or a failed tx", async () => {
    expect(await verifyEvmContractInteraction(def, { txHash: hash, wallets: ["0x" + "3".repeat(40)], ...window }, fakeFetch(ok))).toMatchObject({ reason: "signer_not_verified_wallet" });
    expect(await verifyEvmContractInteraction({ ...def, contract: "0x" + "4".repeat(40) }, { txHash: hash, wallets: [me], ...window }, fakeFetch(ok))).toMatchObject({ reason: "wrong_contract" });
    expect(await verifyEvmContractInteraction(def, { txHash: hash, wallets: [me], ...window }, fakeFetch({ ...ok, eth_getTransactionReceipt: { status: "0x0", blockNumber: "0x10" } }))).toMatchObject({ reason: "tx_failed" });
  });
  it("waits while the tx is not mined", async () => {
    const r = await verifyEvmContractInteraction(def, { txHash: hash, wallets: [me], ...window }, fakeFetch({ ...ok, eth_getTransactionReceipt: null }));
    expect(r.status).toBe("pending");
  });
});

describe("Solana program interaction", () => {
  const me = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
  const program = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const sig = "5".repeat(88);
  const ok = {
    getTransaction: {
      slot: 123,
      blockTime: Math.floor(Date.parse("2026-05-01") / 1000),
      meta: { err: null },
      transaction: { message: { accountKeys: [{ pubkey: me, signer: true }], instructions: [{ programId: program }] } },
    },
  };
  const def = { type: "solana_program_interaction" as const, cluster: "devnet" as const, programId: program };
  it("verifies a finalized tx signed by the proven wallet that calls the program", async () => {
    expect(await verifySolanaProgramInteraction(def, { txHash: sig, wallets: [me], ...window }, fakeFetch(ok))).toMatchObject({ status: "verified", evidence: { provider: "solana-rpc", signer: me } });
  });
  it("rejects the wrong program or signer", async () => {
    expect(await verifySolanaProgramInteraction({ ...def, programId: "11111111111111111111111111111111" }, { txHash: sig, wallets: [me], ...window }, fakeFetch(ok))).toMatchObject({ reason: "wrong_program" });
    expect(await verifySolanaProgramInteraction(def, { txHash: sig, wallets: ["11111111111111111111111111111112"], ...window }, fakeFetch(ok))).toMatchObject({ reason: "signer_not_verified_wallet" });
  });
});
