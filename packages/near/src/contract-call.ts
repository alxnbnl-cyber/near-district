/**
 * Generic "did this wallet call contract X's function Y" verification.
 *
 * Discovery and proof are kept apart:
 *   - an indexer (NearBlocks by default) is used ONLY to find candidate transaction hashes for the
 *     player's wallet: standard RPC has no searchable account history;
 *   - every candidate is then re-fetched as a FINAL outcome from our own RPC, and only that
 *     outcome decides. Nothing reported by the indexer or the browser is trusted.
 *
 * A transaction qualifies when, in the final RPC outcome:
 *   - the signer is one of the player's ownership-verified wallets (they initiated it),
 *   - the transaction's receiver is the configured contract (a direct call, not an internal
 *     cross-contract call made by some other contract),
 *   - one of its actions is a FunctionCall to the configured method,
 *   - the transaction and every receipt it produced succeeded,
 *   - it executed inside the activity's time window.
 *
 * This proves the function was called successfully. It does not claim anything about the business
 * result (what was minted, swapped or staked).
 */
import type { ActivityDef, ActivityNetwork } from "@yielvy/core";
import { failedReceipts, RpcError, txSucceeded, type NearRpc, type TxOutcome } from "./rpc";
import type { OnchainVerdict, VerifyInput } from "./activity";

export type ContractCallDef = Extract<ActivityDef, { type: "near_contract_call" }>;

/** Finds candidate transaction hashes for an account. Results are hints only; RPC decides. */
export interface TxIndexer {
  recentTransactions(account: string, opts: { network: ActivityNetwork; receiver: string; since: Date; limit: number }): Promise<string[]>;
}

const TX_HASH = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;

/** Public NearBlocks API v3 (v1/v2 retired in Nov 2026). Set NEARBLOCKS_API_KEY for higher rate limits (optional). */
export class NearBlocksIndexer implements TxIndexer {
  constructor(
    private readonly opts: { apiKey?: string; baseUrl?: Partial<Record<ActivityNetwork, string>>; fetchImpl?: typeof fetch } = {},
  ) {}

  private base(network: ActivityNetwork) {
    return this.opts.baseUrl?.[network] ?? (network === "testnet" ? "https://api-testnet.nearblocks.io" : "https://api.nearblocks.io");
  }

  async recentTransactions(account: string, o: { network: ActivityNetwork; receiver: string; since: Date; limit: number }): Promise<string[]> {
    const f = this.opts.fetchImpl ?? fetch;
    const url = `${this.base(o.network)}/v3/accounts/${encodeURIComponent(account)}/txns?limit=${Math.min(Math.max(o.limit, 1), 100)}`;
    const res = await f(url, { headers: { accept: "application/json", ...(this.opts.apiKey ? { authorization: `Bearer ${this.opts.apiKey}` } : {}) }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new RpcError(`indexer HTTP ${res.status}`, undefined, res.status === 429 || res.status >= 500);
    type Row = { transaction_hash?: string; signer_account_id?: string; receiver_account_id?: string; block_timestamp?: string };
    const body = (await res.json()) as { data?: Row[] | null };
    const sinceNs = BigInt(o.since.getTime()) * 1_000_000n;
    const out: string[] = [];
    for (const t of body.data ?? []) {
      if (!t.transaction_hash || !TX_HASH.test(t.transaction_hash)) continue;
      if (t.signer_account_id && t.signer_account_id !== account) continue;
      if (t.receiver_account_id && t.receiver_account_id !== o.receiver) continue;
      if (t.block_timestamp && /^\d+$/.test(t.block_timestamp) && BigInt(t.block_timestamp) < sinceNs) continue;
      out.push(t.transaction_hash);
    }
    return out;
  }
}

/** Function-call method names among the transaction's own actions (delegate actions are not followed). */
export function calledMethods(o: TxOutcome): string[] {
  return o.transaction.actions.flatMap((a) => {
    const fc = (a as { FunctionCall?: { method_name?: unknown } } | null)?.FunctionCall;
    return fc && typeof fc.method_name === "string" ? [fc.method_name] : [];
  });
}

/** Pure check of one final outcome against the definition (no time window, no I/O). */
export function matchContractCall(def: ContractCallDef, o: TxOutcome, wallets: string[]): { ok: true } | { ok: false; reason: string } {
  if (!wallets.includes(o.transaction.signer_id)) return { ok: false, reason: "signer_not_verified_wallet" };
  if (o.transaction.receiver_id !== def.contractId) return { ok: false, reason: "wrong_contract" };
  if (!calledMethods(o).includes(def.methodName)) return { ok: false, reason: "wrong_method" };
  if (!txSucceeded(o) || failedReceipts(o).length > 0) return { ok: false, reason: "transaction_failed" };
  return { ok: true };
}

export interface ContractCallInput extends VerifyInput {
  /** Transaction hashes that already counted for something in this mission. */
  exclude?: string[];
}

/**
 * Verifies a contract call. With a txHash, only that transaction is checked; without one, the
 * indexer proposes candidates for each wallet and the newest qualifying one wins.
 */
export async function verifyContractCall(
  /** `archive`: archival RPC used when the regular node no longer has an older transaction. */
  deps: { rpc: NearRpc; archive?: NearRpc | null; indexer: TxIndexer | null; network: ActivityNetwork; blockTime(blockHash: string): Promise<{ height: number; time: Date }> },
  def: ContractCallDef,
  input: ContractCallInput,
): Promise<OnchainVerdict> {
  const now = input.now ?? new Date();
  if (input.wallets.length === 0) return { status: "failed", reason: "no_verified_wallet" };
  if (def.network !== deps.network) return { status: "failed", reason: "network_mismatch" };
  const exclude = new Set(input.exclude ?? []);

  let candidates: string[];
  if (input.txHash) {
    if (!TX_HASH.test(input.txHash)) return { status: "failed", reason: "invalid_tx_hash" };
    candidates = [input.txHash];
  } else {
    if (!deps.indexer) return { status: "pending", reason: "indexer_unavailable", retryAt: new Date(now.getTime() + 60_000) };
    const found = new Set<string>();
    try {
      for (const w of input.wallets) {
        for (const h of await deps.indexer.recentTransactions(w, { network: deps.network, receiver: def.contractId, since: input.windowStart, limit: 50 })) found.add(h);
      }
    } catch {
      return { status: "pending", reason: "indexer_unavailable", retryAt: new Date(now.getTime() + 60_000) };
    }
    candidates = [...found].filter((h) => !exclude.has(h)).slice(0, 25);
    if (candidates.length === 0) return { status: "failed", reason: "not_found" };
  }

  let pending: Extract<OnchainVerdict, { status: "pending" }> | null = null;
  let lastReason = "not_found";
  for (const hash of candidates) {
    if (exclude.has(hash)) {
      lastReason = "evidence_reused";
      continue;
    }
    let outcome: TxOutcome | null = null;
    let transient = false;
    outer: for (const node of [deps.rpc, deps.archive].filter((n): n is NearRpc => Boolean(n))) {
      for (const w of input.wallets) {
        try {
          outcome = await node.txStatus(hash, w);
          break outer;
        } catch (e) {
          if (!(e instanceof RpcError) || e.retryable) transient = true;
        }
      }
    }
    if (!outcome && transient) pending = { status: "pending", reason: "rpc_unavailable", retryAt: new Date(now.getTime() + 60_000) };
    if (!outcome) {
      lastReason = "tx_not_found_for_wallet";
      continue;
    }
    if (outcome.final_execution_status && outcome.final_execution_status !== "FINAL") {
      pending = { status: "pending", reason: "not_final", retryAt: new Date(now.getTime() + 30_000) };
      continue;
    }
    const m = matchContractCall(def, outcome, input.wallets);
    if (!m.ok) {
      lastReason = m.reason;
      continue;
    }
    const receiptId = outcome.transaction_outcome.outcome.receipt_ids?.[0] ?? outcome.transaction_outcome.id;
    const contractReceipt = outcome.receipts_outcome.find((r) => r.id === receiptId) ?? outcome.receipts_outcome[0];
    const blockHash = contractReceipt?.block_hash ?? outcome.transaction_outcome.block_hash;
    const block = await deps.blockTime(blockHash);
    if (block.time < input.windowStart || block.time > input.windowEnd) {
      lastReason = "outside_time_window";
      continue;
    }
    return {
      status: "verified",
      evidence: {
        provider: "near-rpc",
        network: deps.network,
        txHash: outcome.transaction.hash,
        receiptId,
        signer: outcome.transaction.signer_id,
        blockHash,
        blockHeight: block.height,
        executedAt: block.time.toISOString(),
        protocolContract: def.contractId,
        amount: "0",
        tokenId: "",
        detail: { methodName: def.methodName },
      },
    };
  }
  if (pending) return pending;
  return { status: "failed", reason: input.txHash ? lastReason : lastReason === "not_found" ? "not_found" : lastReason };
}

/** Default archival RPC per network (FastNEAR); override with NEAR_ARCHIVAL_RPC_URLS. */
export function archivalRpcUrls(network: ActivityNetwork, env: string | undefined): string[] {
  const list = (env ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : [network === "testnet" ? "https://archival-rpc.testnet.fastnear.com" : "https://archival-rpc.mainnet.fastnear.com"];
}
