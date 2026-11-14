/**
 * Prize payout driver for funded missions (contracts/prize-vault). Each run advances a period by at
 * most one step, re-reading both the database and the vault, so retries are always safe.
 *
 *  SCHEDULED ──(deadline passed)──▶ ELIGIBILITY_FROZEN   winners snapshot (everyone who solved every secret)
 *  ELIGIBILITY_FROZEN ────────────▶ FUNDS_RESERVED       finalize(mission, winners): equal shares fixed on-chain
 *                                 ╰▶ NO_WINNERS          finalize(mission, []) → the whole prize goes back to the project
 *  FUNDS_RESERVED ────────────────▶ COMPLETED            payout batches until every share is paid; remainder refunded
 *
 * The contract guarantees the money rules (only after the deadline, equal shares, winners or sponsor only).
 * This driver only decides who qualified, which can't be checked on-chain because answers are sealed.
 */
import {
  and,
  campaigns,
  chainTransactions,
  creativeSubmissions,
  DEMO_REWARD_PERIOD,
  eligibilitySnapshots,
  eq,
  finalizeSealedHunt,
  inArray,
  notifications,
  qualifications,
  rewardAllocations,
  rewardClaims,
  rewardPeriods,
  walletConnections,
  type Db,
} from "@near-district/db";
import { eligibilityCommitment, rewardPeriodMachine, type CampaignRules, type Candidate, type RewardPeriodState } from "@near-district/core";
import { parseVaultEvents, VAULT_MAX_PAYOUTS_PER_CALL, VAULT_WINNER_STORAGE, type VaultClient, type VaultMission } from "@near-district/near";
import { runOnce, OperatorNotConfigured, type OperatorSigner } from "./operator";
import { RetryLater } from "./queue";

export interface RewardsCtx {
  db: Db;
  vault: VaultClient | null;
  signer: OperatorSigner | null;
  network: string;
  token: { contractId: string; storageDepositYocto: bigint };
  rpc: { view<T>(contractId: string, method: string, args?: object): Promise<T> };
  rulesFor(campaign: typeof campaigns.$inferSelect): Promise<CampaignRules>;
}

type Period = typeof rewardPeriods.$inferSelect;

async function setState(db: Db, p: Period, to: RewardPeriodState, extra: Partial<typeof rewardPeriods.$inferInsert> = {}) {
  rewardPeriodMachine.assert(p.state as RewardPeriodState, to);
  await db.update(rewardPeriods).set({ state: to, updatedAt: new Date(), ...extra }).where(eq(rewardPeriods.id, p.id));
  p.state = to;
}

/** Builds the frozen candidate list for a period. Pure DB reads; no side effects. */
export async function eligibleCandidates(db: Db, c: typeof campaigns.$inferSelect, p: Period, network: string, rules: CampaignRules): Promise<(Candidate & { userId: string })[]> {
  let rows: { userId: string; score: number; at: Date }[];
  if (c.template === "creative_contest") {
    const winners = await db
      .select({ userId: creativeSubmissions.userId, at: creativeSubmissions.createdAt })
      .from(creativeSubmissions)
      .where(and(eq(creativeSubmissions.campaignId, c.id), eq(creativeSubmissions.status, "winner")));
    rows = winners.map((w) => ({ userId: w.userId, score: 0, at: w.at }));
  } else {
    const q = await db
      .select({ userId: qualifications.userId, score: qualifications.score, at: qualifications.qualifiedAt })
      .from(qualifications)
      .where(and(eq(qualifications.campaignId, c.id), eq(qualifications.status, "qualified")));
    rows = rules.periods > 1 ? q.filter((r) => r.at >= p.startsAt && r.at < p.endsAt) : q;
  }
  // a player already paid through the per-player demo simulation is not paid again
  const demoPaid = await db
    .select({ userId: rewardAllocations.userId })
    .from(rewardAllocations)
    .innerJoin(rewardPeriods, eq(rewardPeriods.id, rewardAllocations.rewardPeriodId))
    .where(and(eq(rewardPeriods.campaignId, c.id), eq(rewardPeriods.periodNumber, DEMO_REWARD_PERIOD)));
  if (demoPaid.length) {
    const paid = new Set(demoPaid.map((d) => d.userId));
    rows = rows.filter((r) => !paid.has(r.userId));
  }
  if (rows.length === 0) return [];
  const wallets = await db
    .select({ userId: walletConnections.userId, accountId: walletConnections.accountId })
    .from(walletConnections)
    .where(and(inArray(walletConnections.userId, rows.map((r) => r.userId)), eq(walletConnections.network, network), eq(walletConnections.isPayout, true)));
  const byUser = new Map(wallets.map((w) => [w.userId, w.accountId]));
  const seen = new Set<string>();
  return rows
    .filter((r) => byUser.has(r.userId))
    .map((r) => ({ userId: r.userId, accountId: byUser.get(r.userId)!, score: BigInt(r.score), completedAt: r.at.getTime() }))
    .filter((x) => (seen.has(x.accountId) ? false : (seen.add(x.accountId), true)));
}

async function recordTx(db: Db, network: string, txHash: string, signer: string, receiver: string, logs: string[], ok: boolean) {
  await db
    .insert(chainTransactions)
    .values({ network, txHash, signerId: signer, receiverId: receiver, status: ok ? "success" : "failure", events: parseVaultEvents(logs), verifiedAt: new Date() })
    .onConflictDoNothing();
}

export async function processPeriod(ctx: RewardsCtx, periodId: string): Promise<string> {
  const { db } = ctx;
  const [p] = await db.select().from(rewardPeriods).where(eq(rewardPeriods.id, periodId)).limit(1);
  if (!p) return "missing";
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, p.campaignId)).limit(1);
  if (!c) return "missing campaign";
  const rules = await ctx.rulesFor(c);
  if (rules.fundingSource === "none") return "unfunded";
  if (!ctx.vault || c.vaultCampaignId === null) {
    if (p.state !== "REQUIRES_REVIEW") await setState(db, p, "REQUIRES_REVIEW", { blockedReason: "Prize vault not configured or mission has no vault" });
    return "blocked: no vault";
  }
  const vault = ctx.vault;
  const mid = c.vaultCampaignId;
  const mission = async (): Promise<VaultMission> => {
    const m = await vault.mission(mid);
    if (!m) throw new Error(`prize vault has no mission ${mid}`);
    return m;
  };
  const now = new Date();

  switch (p.state) {
    case "SCHEDULED":
    case "REQUIRES_REVIEW": {
      if (p.endsAt > now) throw new RetryLater(Math.ceil((p.endsAt.getTime() - now.getTime()) / 1000), "mission still running");
      if (c.template === "creative_contest" && c.status !== "AWAITING_RESULTS" && c.status !== "COMPLETED") throw new RetryLater(3600, "waiting for organizer to select winners");
      const m = await mission();
      const chainDeadline = Number(BigInt(m.deadline_ns) / 1_000_000n);
      if (chainDeadline > now.getTime()) throw new RetryLater(Math.ceil((chainDeadline - now.getTime()) / 1000), "vault deadline not reached");
      // score sealed answers first (idempotent), so winners never depend on the separate campaign tick having run
      if (c.template === "treasure_hunt") await finalizeSealedHunt(db, c.id, now);
      const cands = await eligibleCandidates(db, c, p, ctx.network, rules);
      const ids = cands.map((x) => x.accountId);
      const [existing] = await db.select().from(eligibilitySnapshots).where(eq(eligibilitySnapshots.rewardPeriodId, p.id)).limit(1);
      if (!existing) {
        await db.insert(eligibilitySnapshots).values({
          rewardPeriodId: p.id,
          commitment: eligibilityCommitment(mid.toString(), String(p.periodNumber), ids),
          participantCount: cands.length,
          participants: cands.map((x) => ({ userId: x.userId, accountId: x.accountId, score: Number(x.score), completedAt: new Date(x.completedAt).toISOString() })),
        });
      }
      await setState(db, p, "ELIGIBILITY_FROZEN", { blockedReason: null });
      return `frozen with ${cands.length} winner(s)`;
    }

    case "ELIGIBILITY_FROZEN": {
      const [snap] = await db.select().from(eligibilitySnapshots).where(eq(eligibilitySnapshots.rewardPeriodId, p.id)).limit(1);
      if (!snap) throw new Error("eligibility snapshot missing");
      const ids = snap.participants.map((x) => x.accountId);
      // winners must be registered with the token before they can receive it; the operator pays that storage
      for (const acc of ids) {
        const reg = await ctx.rpc.view<unknown>(ctx.token.contractId, "storage_balance_of", { account_id: acc });
        if (reg) continue;
        await runOnce(db, ctx.signer, `token-register:${ctx.token.contractId}:${acc}`, "storage_deposit", c.id, ctx.token.contractId,
          { methodName: "storage_deposit", args: { account_id: acc, registration_only: true }, gasTgas: 30, depositYocto: ctx.token.storageDepositYocto },
          async () => Boolean(await ctx.rpc.view<unknown>(ctx.token.contractId, "storage_balance_of", { account_id: acc })));
      }
      const r = await runOnce(db, ctx.signer, `period:${p.id}:finalize`, "finalize", c.id, vault.contractId,
        { methodName: "finalize", args: { mission_id: mid.toString(), winners: ids }, gasTgas: 100, depositYocto: VAULT_WINNER_STORAGE * BigInt(ids.length) },
        async () => (await mission()).status !== "Open");
      if (r.txHash && !snap.commitTxHash) await db.update(eligibilitySnapshots).set({ commitTxHash: r.txHash }).where(eq(eligibilitySnapshots.id, snap.id));
      const m = await mission();
      if (m.winner_count === 0) {
        if (BigInt(m.refund_owed) > 0n) {
          await runOnce(db, ctx.signer, `period:${p.id}:refund`, "withdraw_refund", c.id, vault.contractId, { methodName: "withdraw_refund", args: { mission_id: mid.toString() }, gasTgas: 60 },
            async () => BigInt((await mission()).refund_owed) === 0n);
        }
        await setState(db, p, "NO_WINNERS", { blockedReason: "Nobody solved every secret; the prize went back to the project" });
        await notifySponsor(db, c, "No winners this time", "Nobody solved every secret before the deadline, so the full prize was returned to your wallet.");
        return "no winners, refunded";
      }
      const share = BigInt(m.share);
      const byAccount = new Map(snap.participants.map((x) => [x.accountId, x.userId]));
      await db.transaction(async (tx) => {
        const have = await tx.select({ id: rewardAllocations.id }).from(rewardAllocations).where(eq(rewardAllocations.rewardPeriodId, p.id));
        if (have.length) return;
        for (const acc of ids) {
          const [row] = await tx.insert(rewardAllocations).values({ rewardPeriodId: p.id, userId: byAccount.get(acc)!, accountId: acc, amount: share, rank: null, proof: [] }).returning();
          await tx.insert(rewardClaims).values({ allocationId: row!.id, state: "SUBMITTED", submittedAt: new Date() });
        }
        await tx.update(rewardPeriods).set({ allocatedTotal: share * BigInt(ids.length) }).where(eq(rewardPeriods.id, p.id));
      });
      await setState(db, p, "FUNDS_RESERVED", { reservedBonus: share * BigInt(ids.length) });
      return `finalized ${ids.length} winner(s), ${share} each`;
    }

    case "FUNDS_RESERVED": {
      if (!ctx.signer) throw new OperatorNotConfigured();
      let m = await mission();
      // 1) dispatch the next batch of payouts (the contract's cursor makes this safe to repeat)
      if (m.status === "Paying" && m.next_index < m.winner_count) {
        const res = await ctx.signer.call(vault.contractId, { methodName: "payout", args: { mission_id: mid.toString() }, gasTgas: 20 + 20 * VAULT_MAX_PAYOUTS_PER_CALL });
        await recordTx(db, ctx.network, res.txHash, ctx.signer.accountId, vault.contractId, res.logs, res.success);
        await applyPayoutEvents(db, p, res.txHash, res.logs);
        m = await mission();
        if (m.next_index < m.winner_count) throw new RetryLater(5, "more payout batches to send");
      }
      // 2) retry failed transfers (usually a wallet that wasn't registered with the token)
      const winners = await vault.winners(mid, m.winner_count);
      const failed = winners.filter((w) => w.state === "Failed").slice(0, VAULT_MAX_PAYOUTS_PER_CALL);
      if (failed.length) {
        for (const w of failed) {
          const reg = await ctx.rpc.view<unknown>(ctx.token.contractId, "storage_balance_of", { account_id: w.account_id });
          if (!reg) await ctx.signer.call(ctx.token.contractId, { methodName: "storage_deposit", args: { account_id: w.account_id, registration_only: true }, gasTgas: 30, depositYocto: ctx.token.storageDepositYocto });
        }
        const res = await ctx.signer.call(vault.contractId, { methodName: "retry_payouts", args: { mission_id: mid.toString(), indexes: failed.map((w) => w.index) }, gasTgas: 20 + 20 * failed.length });
        await recordTx(db, ctx.network, res.txHash, ctx.signer.accountId, vault.contractId, res.logs, res.success);
        await applyPayoutEvents(db, p, res.txHash, res.logs);
        throw new RetryLater(30, `retried ${failed.length} failed payout(s)`);
      }
      // 3) the rounding remainder goes back to the project
      if (BigInt(m.refund_owed) > 0n) {
        const res = await ctx.signer.call(vault.contractId, { methodName: "withdraw_refund", args: { mission_id: mid.toString() }, gasTgas: 60 });
        await recordTx(db, ctx.network, res.txHash, ctx.signer.accountId, vault.contractId, res.logs, res.success);
      }
      m = await mission();
      if (m.status !== "Completed") throw new RetryLater(20, `waiting for payouts to land (${m.paid_count}/${m.winner_count})`);
      // a payout we didn't see in logs (e.g. a crash mid-run) is still confirmed from chain state
      const paidAccounts = new Set(winners.filter((w) => w.state === "Paid").map((w) => w.account_id));
      const open = await db
        .select({ claim: rewardClaims, a: rewardAllocations })
        .from(rewardClaims)
        .innerJoin(rewardAllocations, eq(rewardAllocations.id, rewardClaims.allocationId))
        .where(and(eq(rewardAllocations.rewardPeriodId, p.id), inArray(rewardClaims.state, ["AVAILABLE", "SUBMITTED", "FAILED"])));
      for (const o of open) {
        if (paidAccounts.has(o.a.accountId) || o.claim.txHash) await db.update(rewardClaims).set({ state: "CONFIRMED", confirmedAt: new Date(), updatedAt: new Date() }).where(eq(rewardClaims.id, o.claim.id));
      }
      await setState(db, p, "WINNERS_FINALIZED");
      await setState(db, p, "CLAIMABLE");
      await setState(db, p, "COMPLETED");
      const paid = await db.select({ userId: rewardAllocations.userId }).from(rewardAllocations).where(eq(rewardAllocations.rewardPeriodId, p.id));
      for (const w of paid) {
        await db
          .insert(notifications)
          .values({ userId: w.userId, kind: "reward_ready", title: "Prize paid to your wallet", body: `Your equal share of "${c.title}" was sent to your NEAR wallet.`, link: "/me/rewards", dedupeKey: `reward_paid:${p.id}` })
          .onConflictDoNothing();
      }
      return `completed: ${m.paid_count} paid`;
    }

    default:
      return `no action in ${p.state}`;
  }
}

/** Marks each winner's claim with the transaction that paid (or failed to pay) them. */
async function applyPayoutEvents(db: Db, p: Period, txHash: string, logs: string[]) {
  for (const e of parseVaultEvents(logs)) {
    if (e.event !== "reward_paid" && e.event !== "reward_failed") continue;
    const [a] = await db.select({ id: rewardAllocations.id }).from(rewardAllocations).where(and(eq(rewardAllocations.rewardPeriodId, p.id), eq(rewardAllocations.accountId, e.data.account_id!))).limit(1);
    if (!a) continue;
    const ok = e.event === "reward_paid";
    await db
      .update(rewardClaims)
      .set({ state: ok ? "CONFIRMED" : "FAILED", txHash, confirmedAt: ok ? new Date() : null, failureReason: ok ? null : "Token transfer failed; retrying", updatedAt: new Date() })
      .where(eq(rewardClaims.allocationId, a.id));
  }
}

async function notifySponsor(db: Db, c: typeof campaigns.$inferSelect, title: string, body: string) {
  await db
    .insert(notifications)
    .values({ userId: c.createdBy, kind: "organizer_action", title, body, link: `/organizer/campaigns/${c.id}`, dedupeKey: `${title}:${c.id}:${new Date().toISOString().slice(0, 10)}` })
    .onConflictDoNothing();
}
