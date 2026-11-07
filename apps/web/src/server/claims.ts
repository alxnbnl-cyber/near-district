import "server-only";
import { and, campaigns, eq, rewardAllocations, rewardClaims, rewardPeriods } from "@yielvy/db";
import type { Db } from "@yielvy/db";
import { allLogs, parseVaultEvents, txSucceeded, type NearRpc } from "@yielvy/near";
import { badRequest, conflict, forbidden, HttpError, notFound } from "./http";
import { audit } from "./audit";
import type { SessionUser } from "./session";

/** Storage the vault charges per claim record; excess is refunded by the contract. */
export const CLAIM_STORAGE_DEPOSIT = "10000000000000000000000"; // 0.01 NEAR

async function loadAllocation(db: Db, user: SessionUser, allocationId: string) {
  const [row] = await db
    .select({ a: rewardAllocations, p: rewardPeriods, c: campaigns })
    .from(rewardAllocations)
    .innerJoin(rewardPeriods, eq(rewardPeriods.id, rewardAllocations.rewardPeriodId))
    .innerJoin(campaigns, eq(campaigns.id, rewardPeriods.campaignId))
    .where(eq(rewardAllocations.id, allocationId))
    .limit(1);
  if (!row) throw notFound("Reward not found.");
  if (row.a.userId !== user.userId) throw forbidden();
  if (user.payoutAccountId !== row.a.accountId) throw forbidden("Switch to the wallet this reward was allocated to.");
  return row;
}

/**
 * Returns the exact transactions the user's wallet must sign. The claim is bound on-chain to
 * the allocation's account (Merkle leaf), so even a tampered request can't redirect funds.
 */
export async function buildClaimTransactions(db: Db, rpc: NearRpc, vaultId: string, tokenId: string, user: SessionUser, allocationId: string) {
  const { a, p, c } = await loadAllocation(db, user, allocationId);
  const now = new Date();
  if (p.state !== "CLAIMABLE" || !p.claimableAfter || p.claimableAfter > now) throw conflict("This reward isn't claimable yet.");
  if (!p.claimDeadline || p.claimDeadline <= now) throw conflict("The claim window for this reward has closed.", "expired");
  if (c.vaultCampaignId === null) throw new HttpError(500, "Campaign is not linked to the vault.");
  const already = await rpc.view<boolean>(vaultId, "is_claimed", { campaign_id: c.vaultCampaignId.toString(), period_id: p.periodNumber, account_id: a.accountId });
  if (already) throw conflict("This reward has already been claimed.", "already_claimed");
  const storage = await rpc.view<{ total: string } | null>(tokenId, "storage_balance_of", { account_id: a.accountId });
  const txs: { receiverId: string; methodName: string; args: object; gasTgas: number; depositYocto: string }[] = [];
  if (!storage) {
    // The token contract requires the recipient to be registered before it can receive transfers.
    const bounds = await rpc.view<{ min: string }>(tokenId, "storage_balance_bounds");
    txs.push({ receiverId: tokenId, methodName: "storage_deposit", args: { account_id: a.accountId, registration_only: true }, gasTgas: 30, depositYocto: bounds.min });
  }
  txs.push({
    receiverId: vaultId,
    methodName: "claim",
    args: { campaign_id: c.vaultCampaignId.toString(), period_id: p.periodNumber, amount: a.amount.toString(), proof: a.proof },
    gasTgas: 100,
    depositYocto: CLAIM_STORAGE_DEPOSIT,
  });
  return { signerId: a.accountId, transactions: txs };
}

/**
 * Verifies a claim tx against the chain: correct signer, receiver, success, and a vault
 * `claim_confirmed` event for exactly this allocation. A client-reported hash alone proves nothing.
 */
export async function confirmClaim(db: Db, rpc: NearRpc, vaultId: string, user: SessionUser, allocationId: string, txHash: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(txHash)) throw badRequest("That doesn't look like a NEAR transaction hash.");
  const { a, p, c } = await loadAllocation(db, user, allocationId);
  const [existing] = await db.select().from(rewardClaims).where(eq(rewardClaims.allocationId, a.id)).limit(1);
  if (existing?.state === "CONFIRMED") return { state: "CONFIRMED" as const, txHash: existing.txHash };
  const outcome = await rpc.txStatus(txHash, a.accountId);
  const tx = outcome.transaction;
  const events = parseVaultEvents(allLogs(outcome).filter((l) => l.executor === vaultId).map((l) => l.log));
  const confirmed = events.some(
    (e) =>
      e.event === "claim_confirmed" &&
      e.data.account_id === a.accountId &&
      e.data.amount === a.amount.toString() &&
      e.data.period_id === String(p.periodNumber) &&
      e.data.campaign_id === c.vaultCampaignId?.toString(),
  );
  const failed = events.some((e) => e.event === "claim_failed" && e.data.account_id === a.accountId);
  const valid = tx.signer_id === a.accountId && tx.receiver_id === vaultId && txSucceeded(outcome) && confirmed;
  const state = valid ? "CONFIRMED" : "FAILED";
  await db.transaction(async (txn) => {
    if (existing) {
      await txn
        .update(rewardClaims)
        .set({ state, txHash, failureReason: valid ? null : failed ? "The token transfer failed (is your wallet registered with the token?)" : "Transaction did not confirm the claim", confirmedAt: valid ? new Date() : null, updatedAt: new Date() })
        .where(and(eq(rewardClaims.id, existing.id)));
    } else {
      await txn.insert(rewardClaims).values({ allocationId: a.id, state, txHash, submittedAt: new Date(), confirmedAt: valid ? new Date() : null, failureReason: valid ? null : "Transaction did not confirm the claim" });
    }
    await audit(txn, { actorUserId: user.userId, action: `claim.${state.toLowerCase()}`, targetType: "allocation", targetId: a.id, metadata: { txHash } });
  });
  return { state, txHash };
}
