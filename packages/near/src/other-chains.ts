/**
 * Activity checks on other chains (for Web3 projects outside NEAR). Like the NEAR verifier, a tx hash from the
 * browser is only a pointer: the outcome is re-fetched from a public RPC and checked for signer, success,
 * target and time window.
 */
import type { ActivityDef } from "@yielvy/core";
import type { OnchainVerdict, VerifyInput } from "./activity";

export const EVM_RPC: Record<string, { url: string; explorer: string }> = {
  sepolia: { url: "https://ethereum-sepolia-rpc.publicnode.com", explorer: "https://sepolia.etherscan.io/tx/" },
  "base-sepolia": { url: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org/tx/" },
  ethereum: { url: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io/tx/" },
  base: { url: "https://mainnet.base.org", explorer: "https://basescan.org/tx/" },
};
export const SOLANA_RPC: Record<string, string> = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

async function rpc<T>(url: string, method: string, params: unknown[], fetcher: typeof fetch = fetch): Promise<T> {
  const r = await fetcher(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  if (!r.ok) throw new Error(`rpc_http_${r.status}`);
  const j = (await r.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(`rpc_error:${j.error.message.slice(0, 60)}`);
  return j.result as T;
}

const inWindow = (t: Date, i: VerifyInput) => t >= i.windowStart && t <= i.windowEnd;
const retry = (reason: string, i: VerifyInput, ms = 30_000): OnchainVerdict => ({ status: "pending", reason, retryAt: new Date((i.now ?? new Date()).getTime() + ms) });

/** A successful EVM transaction from the player's proven address to the required contract. */
export async function verifyEvmContractInteraction(def: Extract<ActivityDef, { type: "evm_contract_interaction" }>, input: VerifyInput, fetcher: typeof fetch = fetch): Promise<OnchainVerdict> {
  const net = EVM_RPC[def.chain];
  if (!net) return { status: "failed", reason: "chain_not_supported" };
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) return { status: "failed", reason: "invalid_tx_hash" };
  if (!input.wallets.length) return { status: "failed", reason: "no_verified_wallet" };
  let tx: { from: string; to: string | null; value: string; blockNumber: string | null } | null;
  let receipt: { status: string; blockNumber: string } | null;
  try {
    tx = await rpc(net.url, "eth_getTransactionByHash", [input.txHash], fetcher);
    receipt = await rpc(net.url, "eth_getTransactionReceipt", [input.txHash], fetcher);
  } catch {
    return retry("rpc_unavailable", input, 60_000);
  }
  if (!tx) return { status: "failed", reason: "tx_not_found" };
  if (!receipt || !tx.blockNumber) return retry("not_final", input);
  if (!input.wallets.some((w) => w.toLowerCase() === tx!.from.toLowerCase())) return { status: "failed", reason: "signer_not_verified_wallet" };
  if (receipt.status !== "0x1") return { status: "failed", reason: "tx_failed" };
  if (!tx.to || tx.to.toLowerCase() !== def.contract.toLowerCase()) return { status: "failed", reason: "wrong_contract" };
  if (def.minValueWei && BigInt(tx.value) < BigInt(def.minValueWei)) return { status: "failed", reason: "amount_below_minimum" };
  const block = await rpc<{ timestamp: string; hash: string }>(net.url, "eth_getBlockByNumber", [receipt.blockNumber, false], fetcher).catch(() => null);
  if (!block) return retry("rpc_unavailable", input, 60_000);
  const at = new Date(Number(BigInt(block.timestamp)) * 1000);
  if (!inWindow(at, input)) return { status: "failed", reason: "outside_time_window" };
  return {
    status: "verified",
    evidence: {
      provider: "evm-rpc",
      network: def.chain,
      txHash: input.txHash,
      receiptId: input.txHash,
      signer: tx.from,
      blockHash: block.hash,
      blockHeight: Number(BigInt(receipt.blockNumber)),
      executedAt: at.toISOString(),
      protocolContract: def.contract,
      amount: BigInt(tx.value).toString(),
      tokenId: "native",
      detail: { explorer: net.explorer + input.txHash },
    },
  };
}

/** A successful Solana transaction signed by the player's proven address that invokes the required program. */
export async function verifySolanaProgramInteraction(def: Extract<ActivityDef, { type: "solana_program_interaction" }>, input: VerifyInput, fetcher: typeof fetch = fetch): Promise<OnchainVerdict> {
  const url = SOLANA_RPC[def.cluster];
  if (!url) return { status: "failed", reason: "chain_not_supported" };
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(input.txHash)) return { status: "failed", reason: "invalid_tx_hash" };
  if (!input.wallets.length) return { status: "failed", reason: "no_verified_wallet" };
  type SolTx = {
    slot: number;
    blockTime: number | null;
    meta: { err: unknown } | null;
    transaction: { message: { accountKeys: { pubkey: string; signer: boolean }[]; instructions: { programId: string }[] } };
  } | null;
  let t: SolTx;
  try {
    t = await rpc<SolTx>(url, "getTransaction", [input.txHash, { encoding: "jsonParsed", commitment: "finalized", maxSupportedTransactionVersion: 0 }], fetcher);
  } catch {
    return retry("rpc_unavailable", input, 60_000);
  }
  if (!t) return retry("not_final", input);
  if (t.meta?.err) return { status: "failed", reason: "tx_failed" };
  const signers = t.transaction.message.accountKeys.filter((k) => k.signer).map((k) => k.pubkey);
  const signer = input.wallets.find((w) => signers.includes(w));
  if (!signer) return { status: "failed", reason: "signer_not_verified_wallet" };
  if (!t.transaction.message.instructions.some((ix) => ix.programId === def.programId)) return { status: "failed", reason: "wrong_program" };
  if (!t.blockTime) return retry("not_final", input);
  const at = new Date(t.blockTime * 1000);
  if (!inWindow(at, input)) return { status: "failed", reason: "outside_time_window" };
  return {
    status: "verified",
    evidence: {
      provider: "solana-rpc",
      network: def.cluster,
      txHash: input.txHash,
      receiptId: input.txHash,
      signer,
      blockHash: String(t.slot),
      blockHeight: t.slot,
      executedAt: at.toISOString(),
      protocolContract: def.programId,
      amount: "0",
      tokenId: "native",
      detail: { explorer: `https://explorer.solana.com/tx/${input.txHash}${def.cluster === "devnet" ? "?cluster=devnet" : ""}` },
    },
  };
}

/** One place that routes every on-chain activity type to its verifier (used by the web app and the worker). */
export function dispatchOnchain(v: import("./activity").NearActivityVerifier) {
  return (def: ActivityDef, input: VerifyInput): Promise<OnchainVerdict> =>
    def.type === "near_rhea_swap"
      ? v.verifySwap(def, input)
      : def.type === "near_rhea_lending_supply"
        ? v.verifyLendingSupply(def, input)
        : def.type === "near_stake"
          ? v.verifyStake(def, input)
          : def.type === "evm_contract_interaction"
            ? verifyEvmContractInteraction(def, input)
            : def.type === "solana_program_interaction"
              ? verifySolanaProgramInteraction(def, input)
              : Promise.resolve({ status: "failed", reason: "unsupported_activity" });
}
