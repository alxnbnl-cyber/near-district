/**
 * Operator transaction signer. The operator key is a NEAR function-call-scoped key on the
 * operator account (see docs/security/key-management.md); the vault contract limits what that
 * account can do (no arbitrary transfers, capped reservations, vetoable results).
 *
 * Every submission is recorded in blockchain_operations under an idempotency key BEFORE it is
 * sent, and callers re-read chain state before deciding to (re)send.
 */
import { blockchainOperations, eq, sql, type Db } from "@near-district/db";

export interface OperatorCall {
  methodName: string;
  args: object;
  gasTgas: number;
  depositYocto?: bigint;
}

export interface OperatorSigner {
  accountId: string;
  call(contractId: string, c: OperatorCall): Promise<{ txHash: string; success: boolean; logs: string[] }>;
}

export class OperatorNotConfigured extends Error {
  constructor() {
    super("Operator signer is not configured (OPERATOR_ACCOUNT_ID / OPERATOR_PRIVATE_KEY). On-chain steps are paused.");
  }
}

export async function createOperatorSigner(env: Record<string, string | undefined>): Promise<OperatorSigner | null> {
  const accountId = env.OPERATOR_ACCOUNT_ID;
  const key = env.OPERATOR_PRIVATE_KEY;
  const rpc = (env.NEAR_RPC_URLS ?? "").split(",")[0];
  if (!accountId || !key || !rpc) return null;
  if (!key.startsWith("ed25519:")) throw new Error("OPERATOR_PRIVATE_KEY must be an ed25519 secret key string");
  const { Account } = await import("near-api-js");
  const account = new Account(accountId, rpc, key as `ed25519:${string}`);
  return {
    accountId,
    async call(contractId, c) {
      const res = (await account.callFunctionRaw({
        contractId,
        methodName: c.methodName,
        args: c.args as Record<string, unknown>,
        gas: BigInt(c.gasTgas) * 10n ** 12n,
        deposit: c.depositYocto ?? 0n,
        waitUntil: "FINAL",
      })) as unknown as {
        transaction: { hash: string };
        status: { SuccessValue?: string; Failure?: unknown };
        receipts_outcome: { outcome: { logs: string[] } }[];
      };
      return {
        txHash: res.transaction.hash,
        success: res.status.SuccessValue !== undefined,
        logs: res.receipts_outcome.flatMap((r) => r.outcome.logs),
      };
    },
  };
}

/**
 * Runs an operator call at most once per idempotency key. If a previous attempt was
 * submitted but its outcome is unknown, `alreadyApplied` (a chain-state check) decides.
 */
export async function runOnce(
  db: Db,
  signer: OperatorSigner | null,
  key: string,
  kind: string,
  campaignId: string | null,
  contractId: string,
  call: OperatorCall,
  alreadyApplied: () => Promise<boolean>,
): Promise<{ txHash: string | null; skipped: boolean }> {
  const [existing] = await db.select().from(blockchainOperations).where(eq(blockchainOperations.idempotencyKey, key)).limit(1);
  if (existing?.status === "succeeded") return { txHash: existing.txHash, skipped: true };
  if (await alreadyApplied()) {
    await db
      .insert(blockchainOperations)
      .values({ kind, campaignId, idempotencyKey: key, args: call.args, status: "succeeded" })
      .onConflictDoUpdate({ target: blockchainOperations.idempotencyKey, set: { status: "succeeded", updatedAt: new Date() } });
    return { txHash: existing?.txHash ?? null, skipped: true };
  }
  if (!signer) throw new OperatorNotConfigured();
  await db
    .insert(blockchainOperations)
    .values({ kind, campaignId, idempotencyKey: key, args: call.args, status: "submitted", attempts: 1 })
    .onConflictDoUpdate({ target: blockchainOperations.idempotencyKey, set: { status: "submitted", attempts: sql`${blockchainOperations.attempts} + 1`, updatedAt: new Date() } });
  try {
    const r = await signer.call(contractId, call);
    await db
      .update(blockchainOperations)
      .set({ status: r.success ? "succeeded" : "failed", txHash: r.txHash, lastError: r.success ? null : "transaction failed", updatedAt: new Date() })
      .where(eq(blockchainOperations.idempotencyKey, key));
    if (!r.success) throw new Error(`${call.methodName} failed on-chain (${r.txHash})`);
    return { txHash: r.txHash, skipped: false };
  } catch (e) {
    await db.update(blockchainOperations).set({ lastError: String(e).slice(0, 1000), updatedAt: new Date() }).where(eq(blockchainOperations.idempotencyKey, key));
    throw e;
  }
}
