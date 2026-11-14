import "server-only";
import { randomUUID } from "node:crypto";
import { and, campaigns, chainTransactions, eq, fundingOrders, withdrawalRequests, type Db } from "@yielvy/db";
import { fundingMachine, parseUnits, type FundingState } from "@yielvy/core";
import { allLogs, parseVaultEvents, txSucceeded, type NearRpc, type VaultEvent } from "@yielvy/near";
import { audit } from "./audit";
import { badRequest, conflict, forbidden, HttpError } from "./http";
import type { SessionUser } from "./session";

export interface TxPlan {
  signerId: string;
  transactions: { receiverId: string; methodName: string; args: object; gasTgas: number; depositYocto: string }[];
}

const ONE_YOCTO = "1";
const MISSION_STORAGE = "10000000000000000000000"; // 0.01 NEAR, kept by the vault for the mission record

function requireSponsor(user: SessionUser): string {
  if (!user.payoutAccountId) throw new HttpError(403, "Verify your NEAR wallet first.", "wallet_required");
  return user.payoutAccountId;
}

/** Verifies a tx on-chain and returns vault events emitted by it. Records it for audit. */
async function verifiedVaultEvents(db: Db, rpc: NearRpc, network: string, vaultId: string, txHash: string, signer: string): Promise<VaultEvent[]> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(txHash)) throw badRequest("Invalid transaction hash.");
  const outcome = await rpc.txStatus(txHash, signer);
  if (outcome.transaction.signer_id !== signer) throw forbidden("That transaction was signed by a different account.");
  const events = parseVaultEvents(allLogs(outcome).filter((l) => l.executor === vaultId).map((l) => l.log));
  await db
    .insert(chainTransactions)
    .values({
      network,
      txHash,
      signerId: outcome.transaction.signer_id,
      receiverId: outcome.transaction.receiver_id,
      status: txSucceeded(outcome) ? "success" : "failure",
      events,
      verifiedAt: new Date(),
    })
    .onConflictDoNothing();
  return events;
}

// ------------------------------------------------------------------ open the mission's escrow in the prize vault

/** The on-chain deadline is the mission's own deadline: prizes can only be paid out after it. */
export function missionDeadline(campaign: typeof campaigns.$inferSelect): Date | null {
  if (campaign.endsAt) return campaign.endsAt;
  const draft = (campaign.draftRules ?? {}) as { endsAt?: string };
  return draft.endsAt ? new Date(draft.endsAt) : null;
}

export function planRegister(user: SessionUser, vaultId: string, campaign: typeof campaigns.$inferSelect): TxPlan {
  const deadline = missionDeadline(campaign);
  if (!deadline || Number.isNaN(deadline.getTime())) throw badRequest("Set the mission's deadline before opening the prize vault.");
  if (deadline.getTime() <= Date.now()) throw badRequest("The mission's deadline has already passed.");
  return {
    signerId: requireSponsor(user),
    transactions: [
      {
        receiverId: vaultId,
        methodName: "create_mission",
        args: { deadline_ns: (BigInt(deadline.getTime()) * 1_000_000n).toString() },
        gasTgas: 30,
        depositYocto: MISSION_STORAGE,
      },
    ],
  };
}

export async function confirmRegister(db: Db, rpc: NearRpc, network: string, vaultId: string, user: SessionUser, campaign: typeof campaigns.$inferSelect, txHash: string) {
  const sponsor = requireSponsor(user);
  if (campaign.vaultCampaignId !== null) throw conflict("This mission already has a prize vault.");
  const events = await verifiedVaultEvents(db, rpc, network, vaultId, txHash, sponsor);
  const created = events.find((e) => e.event === "mission_created" && e.data.sponsor === sponsor);
  if (!created?.data.mission_id) throw badRequest("That transaction did not open a prize vault for your wallet.");
  await db.update(campaigns).set({ vaultCampaignId: BigInt(created.data.mission_id), updatedAt: new Date() }).where(eq(campaigns.id, campaign.id));
  await audit(db, { actorUserId: user.userId, action: "vault.mission_created", targetType: "campaign", targetId: campaign.id, metadata: { txHash, missionId: created.data.mission_id } });
  return { vaultCampaignId: created.data.mission_id };
}

// ------------------------------------------------------------------ native deposit

export async function planDeposit(
  db: Db,
  user: SessionUser,
  vaultId: string,
  tokenId: string,
  decimals: number,
  campaign: typeof campaigns.$inferSelect,
  kind: "principal" | "bonus",
  amountHuman: string,
): Promise<TxPlan & { orderId: string }> {
  const sponsor = requireSponsor(user);
  if (campaign.vaultCampaignId === null) throw conflict("Open the mission's prize vault first.");
  let amount: bigint;
  try {
    amount = parseUnits(amountHuman, decimals);
  } catch {
    throw badRequest(`Enter an amount with at most ${decimals} decimals.`);
  }
  if (amount <= 0n) throw badRequest("Enter an amount above zero.");
  const [order] = await db
    .insert(fundingOrders)
    .values({
      campaignId: campaign.id,
      organizerUserId: user.userId,
      kind,
      route: "native",
      state: "AWAITING_PAYMENT",
      tokenId,
      amount,
      sponsorAccountId: sponsor,
      idempotencyKey: randomUUID(),
    })
    .returning();
  return {
    orderId: order!.id,
    signerId: sponsor,
    transactions: [
      {
        receiverId: tokenId,
        methodName: "ft_transfer_call",
        args: {
          receiver_id: vaultId,
          amount: amount.toString(),
          msg: JSON.stringify({ mission_id: campaign.vaultCampaignId.toString() }),
        },
        gasTgas: 100,
        depositYocto: ONE_YOCTO,
      },
    ],
  };
}

/**
 * Credits a funding order ONLY if the vault emitted a matching funded event in a verified tx.
 * A refunded transfer (vault rejected the msg) emits nothing, so nothing is credited.
 */
export async function confirmDeposit(db: Db, rpc: NearRpc, network: string, vaultId: string, user: SessionUser, orderId: string, txHash: string) {
  const [order] = await db.select().from(fundingOrders).where(and(eq(fundingOrders.id, orderId), eq(fundingOrders.organizerUserId, user.userId))).limit(1);
  if (!order) throw new HttpError(404, "Funding order not found.");
  if (order.state === "RECEIVED" || order.state === "SUPPLIED") return { state: order.state };
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, order.campaignId)).limit(1);
  const events = await verifiedVaultEvents(db, rpc, network, vaultId, txHash, order.sponsorAccountId);
  const ev = events.find((e) => e.event === "prize_funded" && e.data.mission_id === c!.vaultCampaignId?.toString() && e.data.sponsor === order.sponsorAccountId);
  let next: FundingState;
  let received: bigint | null = null;
  if (!ev) next = "FAILED";
  else {
    received = BigInt(ev.data.amount!);
    next = received === order.amount ? "RECEIVED" : "REQUIRES_REVIEW";
  }
  fundingMachine.assert(order.state as FundingState, next);
  try {
    await db
      .update(fundingOrders)
      .set({ state: next, nearTxHash: txHash, receivedAmount: received, failureReason: next === "FAILED" ? "No matching prize deposit in that transaction." : next === "REQUIRES_REVIEW" ? "Received amount differs from the order." : null, updatedAt: new Date() })
      .where(eq(fundingOrders.id, order.id));
  } catch (e) {
    if (String((e as { cause?: { code?: string } }).cause?.code) === "23505") throw conflict("That transaction is already linked to another funding order.");
    throw e;
  }
  await audit(db, { actorUserId: user.userId, action: `funding.${next.toLowerCase()}`, targetType: "funding_order", targetId: order.id, metadata: { txHash, received: received?.toString() } });
  return { state: next };
}

// ------------------------------------------------------------------ cross-chain (NEAR Intents 1Click)

/**
 * Getting unused prize back to the project:
 *   withdraw: sends what the vault owes the sponsor (rounding remainder, or the whole prize if nobody qualified)
 *   refund_unsettled: safety valve if the mission was never settled, 14 days after the deadline
 */
export function planExit(user: SessionUser, vaultId: string, campaign: typeof campaigns.$inferSelect, step: "withdraw" | "refund_unsettled"): TxPlan {
  const sponsor = requireSponsor(user);
  if (campaign.vaultCampaignId === null) throw conflict("This mission has no prize vault.");
  const methodName = step === "withdraw" ? "withdraw_refund" : "refund_unsettled";
  return { signerId: sponsor, transactions: [{ receiverId: vaultId, methodName, args: { mission_id: campaign.vaultCampaignId.toString() }, gasTgas: 60, depositYocto: "0" }] };
}

export async function recordWithdrawal(db: Db, user: SessionUser, campaignId: string, destination: string, amounts: { principal: bigint; yield: bigint; bonus: bigint }) {
  const [row] = await db
    .insert(withdrawalRequests)
    .values({
      campaignId,
      requestedBy: user.userId,
      state: "VALIDATING",
      principalAmount: amounts.principal,
      yieldAmount: amounts.yield,
      bonusAmount: amounts.bonus,
      destinationAccountId: destination,
      idempotencyKey: randomUUID(),
    })
    .returning();
  return row!;
}
