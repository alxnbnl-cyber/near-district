/**
 * Reward-period driver (funded campaigns only). Each run advances a period by at most one
 * state, re-reading both the database and the vault contract so retries are always safe.
 *
 *  SCHEDULED ──(period over)──▶ ELIGIBILITY_FROZEN   snapshot frozen + commit_period on-chain
 *  ELIGIBILITY_FROZEN ────────▶ YIELD_SETTLEMENT_PENDING  harvest_yield (yield-funded only)
 *  YIELD_SETTLEMENT_PENDING ──▶ FUNDS_RESERVED       reconcile_pending, then reserve_for_period
 *  FUNDS_RESERVED ────────────▶ WINNERS_FINALIZED    allocations + finalize_period
 *  WINNERS_FINALIZED ─────────▶ CLAIMABLE            after the on-chain dispute window
 *  CLAIMABLE ─────────────────▶ COMPLETED            close_period after the claim deadline
 */
import {
  and,
  campaigns,
  creativeSubmissions,
  DEMO_REWARD_PERIOD,
  eligibilitySnapshots,
  eq,
  inArray,
  notifications,
  qualifications,
  rewardAllocations,
  rewardClaims,
  rewardPeriods,
  walletConnections,
  type Db,
} from "@yielvy/db";
import {
  allocateRewards,
  buildMerkleTree,
  eligibilityCommitment,
  rewardPeriodMachine,
  type CampaignRules,
  type Candidate,
  type RewardPeriodState,
} from "@yielvy/core";
import type { VaultClient, VaultPeriod } from "@yielvy/near";
import { runOnce, type OperatorSigner } from "./operator";
import { RetryLater } from "./queue";

export interface RewardsCtx {
  db: Db;
  vault: VaultClient | null;
  signer: OperatorSigner | null;
  network: string;
  rulesFor(campaign: typeof campaigns.$inferSelect): Promise<CampaignRules>;
}

type Period = typeof rewardPeriods.$inferSelect;

async function setState(db: Db, p: Period, to: RewardPeriodState, extra: Partial<typeof rewardPeriods.$inferInsert> = {}) {
  rewardPeriodMachine.assert(p.state as RewardPeriodState, to);
  await db.update(rewardPeriods).set({ state: to, updatedAt: new Date(), ...extra }).where(eq(rewardPeriods.id, p.id));
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
    // Multi-period hunts: a qualification counts in the period in which it happened.
    rows = rules.periods > 1 ? q.filter((r) => r.at >= p.startsAt && r.at < p.endsAt) : q;
  }
  // a player already paid through a local demo simulation is not paid again
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
  return rows
    .filter((r) => byUser.has(r.userId))
    .map((r) => ({ userId: r.userId, accountId: byUser.get(r.userId)!, score: BigInt(r.score), completedAt: r.at.getTime() }));
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
    if (p.state !== "REQUIRES_REVIEW") await setState(db, p, "REQUIRES_REVIEW", { blockedReason: "Vault not configured or campaign not registered" });
    return "blocked: no vault";
  }
  const vault = ctx.vault;
  const vid = c.vaultCampaignId;
  const onchain = (): Promise<VaultPeriod | null> => vault.period(vid, p.periodNumber);
  const now = new Date();

  switch (p.state) {
    case "SCHEDULED": {
      if (p.endsAt > now) throw new RetryLater(Math.ceil((p.endsAt.getTime() - now.getTime()) / 1000), "period still running");
      if (c.template === "creative_contest" && c.status !== "AWAITING_RESULTS" && c.status !== "COMPLETED") {
        throw new RetryLater(3600, "waiting for organizer to select winners");
      }
      const cands = await eligibleCandidates(db, c, p, ctx.network, rules);
      if (cands.length === 0) {
        await setState(db, p, "NO_WINNERS", { blockedReason: "No eligible participants with a verified payout wallet" });
        return "no winners";
      }
      const ids = cands.map((x) => x.accountId);
      const commitment = eligibilityCommitment(vid.toString(), String(p.periodNumber), ids);
      const [existing] = await db.select().from(eligibilitySnapshots).where(eq(eligibilitySnapshots.rewardPeriodId, p.id)).limit(1);
      const snap =
        existing ??
        (
          await db
            .insert(eligibilitySnapshots)
            .values({
              rewardPeriodId: p.id,
              commitment,
              participantCount: cands.length,
              participants: cands.map((x) => ({ userId: x.userId, accountId: x.accountId, score: Number(x.score), completedAt: new Date(x.completedAt).toISOString() })),
            })
            .returning()
        )[0]!;
      const r = await runOnce(
        db,
        ctx.signer,
        `period:${p.id}:commit`,
        "commit_period",
        c.id,
        vault.contractId,
        { methodName: "commit_period", args: { campaign_id: vid.toString(), period_id: p.periodNumber, eligibility_root: snap.commitment, eligible_count: snap.participantCount }, gasTgas: 30, depositYocto: 10n ** 22n },
        async () => (await onchain())?.eligibility_root === snap.commitment,
      );
      if (r.txHash && !snap.commitTxHash) await db.update(eligibilitySnapshots).set({ commitTxHash: r.txHash }).where(eq(eligibilitySnapshots.id, snap.id));
      await setState(db, p, "ELIGIBILITY_FROZEN");
      return "frozen";
    }

    case "ELIGIBILITY_FROZEN": {
      // Fixed prizes only: nothing to harvest, go straight to reserving the prize.
      await setState(db, p, "YIELD_SETTLEMENT_PENDING");
      return "no harvest needed";
    }

    case "YIELD_SETTLEMENT_PENDING": {
      const totals = await vault.totals();
      if (totals.pending_op && totals.pending_op.campaign_id === vid.toString()) {
        await runOnce(db, ctx.signer, `period:${p.id}:reconcile:${totals.pending_op.op_id}`, "reconcile_pending", c.id, vault.contractId, { methodName: "reconcile_pending", args: {}, gasTgas: 100 }, async () => false);
        throw new RetryLater(30, "reconciled pending op; re-checking");
      }
      if (totals.pending_op) throw new RetryLater(60, "vault busy with another campaign");
      const camp = await vault.campaign(vid);
      if (!camp) throw new Error("vault campaign missing");
      const onP = await onchain();
      const alreadyReserved = BigInt(onP?.reserved_yield ?? "0") + BigInt(onP?.reserved_bonus ?? "0");
      if (alreadyReserved === 0n) {
        const budgetPerPeriod = rules.plannedDirectBudget ? BigInt(rules.plannedDirectBudget) / BigInt(rules.periods) : BigInt(camp.bonus_available);
        const fromYield = 0n; // fixed prizes only
        const fromBonus = minBig(BigInt(camp.bonus_available), budgetPerPeriod);
        const cap = BigInt(camp.max_operator_reserve_per_period);
        let y = minBig(fromYield, cap);
        let b = minBig(fromBonus, cap - y);
        if (y + b === 0n) {
          await setState(db, p, "REQUIRES_REVIEW", { blockedReason: cap === 0n ? "Sponsor must reserve funds (operator cap is 0)" : "No prize available to reserve" });
          await notifySponsor(db, c, "Reward period needs funds", "There are no collected funds available to reserve for this reward period yet.");
          return "nothing to reserve";
        }
        await runOnce(
          db,
          ctx.signer,
          `period:${p.id}:reserve`,
          "reserve_for_period",
          c.id,
          vault.contractId,
          { methodName: "reserve_for_period", args: { campaign_id: vid.toString(), period_id: p.periodNumber, from_yield: y.toString(), from_bonus: b.toString() }, gasTgas: 30 },
          async () => {
            const q = await onchain();
            return BigInt(q?.reserved_yield ?? "0") + BigInt(q?.reserved_bonus ?? "0") > 0n;
          },
        );
        void y;
        void b;
      }
      const after = await onchain();
      await setState(db, p, "FUNDS_RESERVED", { reservedYield: BigInt(after!.reserved_yield), reservedBonus: BigInt(after!.reserved_bonus) });
      return "reserved";
    }

    case "FUNDS_RESERVED": {
      const onP = await onchain();
      if (!onP) throw new Error("on-chain period missing");
      const [snap] = await db.select().from(eligibilitySnapshots).where(eq(eligibilitySnapshots.rewardPeriodId, p.id)).limit(1);
      const pool = BigInt(onP.reserved_yield) + BigInt(onP.reserved_bonus);
      const candidates: Candidate[] = snap!.participants.map((x) => ({ accountId: x.accountId, score: BigInt(x.score), completedAt: Date.parse(x.completedAt) }));
      const winnersByAccount =
        rules.reward.mode === "organizer_selected" ? candidates.map((x) => x.accountId) : undefined; // contest snapshot already = selected winners
      const result = allocateRewards(
        pool,
        candidates,
        { ...rules.reward, perPersonCap: rules.reward.perPersonCap ? BigInt(rules.reward.perPersonCap) : undefined, minPayout: BigInt(rules.reward.minPayout) },
        { selectedAccountIds: winnersByAccount },
      );
      if (result.allocations.length === 0) {
        await setState(db, p, "REQUIRES_REVIEW", { blockedReason: result.blockedReason ?? "No allocations" });
        return "blocked";
      }
      const tree = buildMerkleTree(result.allocations.map((a) => ({ campaignId: vid.toString(), periodId: String(p.periodNumber), accountId: a.accountId, amount: a.amount })));
      const byAccount = new Map(snap!.participants.map((x) => [x.accountId, x.userId]));
      await db.transaction(async (tx) => {
        const existing = await tx.select({ id: rewardAllocations.id }).from(rewardAllocations).where(eq(rewardAllocations.rewardPeriodId, p.id));
        if (existing.length === 0) {
          for (const a of result.allocations) {
            const [row] = await tx
              .insert(rewardAllocations)
              .values({ rewardPeriodId: p.id, userId: byAccount.get(a.accountId)!, accountId: a.accountId, amount: a.amount, rank: null, proof: tree.proofs.get(a.accountId)! })
              .returning();
            await tx.insert(rewardClaims).values({ allocationId: row!.id, state: "AVAILABLE" });
          }
        }
        await tx.update(rewardPeriods).set({ allocationRoot: tree.root, allocatedTotal: result.allocatedTotal }).where(eq(rewardPeriods.id, p.id));
      });
      if (c.vaultCampaignId !== null) {
        const camp = await vault.campaign(vid);
        if (camp?.require_sponsor_finalize) {
          await notifySponsor(db, c, "Approve reward results", "Results are computed. Please review and finalize them from your wallet.");
          throw new RetryLater(3600, "waiting for sponsor to finalize on-chain");
        }
      }
      await runOnce(
        db,
        ctx.signer,
        `period:${p.id}:finalize:${tree.root}`,
        "finalize_period",
        c.id,
        vault.contractId,
        { methodName: "finalize_period", args: { campaign_id: vid.toString(), period_id: p.periodNumber, allocation_root: tree.root, allocated_total: result.allocatedTotal.toString(), claim_window_ns: (BigInt(rules.claimWindowDays) * 86_400n * 1_000_000_000n).toString() }, gasTgas: 30 },
        async () => (await onchain())?.allocation_root === tree.root,
      );
      const fin = await onchain();
      await setState(db, p, "WINNERS_FINALIZED", {
        claimableAfter: new Date(Number(BigInt(fin!.claimable_after) / 1_000_000n)),
        claimDeadline: new Date(Number(BigInt(fin!.claim_deadline) / 1_000_000n)),
      });
      return "finalized";
    }

    case "WINNERS_FINALIZED": {
      const onP = await onchain();
      if (onP?.status === "Vetoed") {
        await setState(db, p, "VETOED", { blockedReason: "Result vetoed on-chain during the dispute window" });
        return "vetoed";
      }
      if (!p.claimableAfter || p.claimableAfter > now) throw new RetryLater(Math.max(30, Math.ceil(((p.claimableAfter?.getTime() ?? now.getTime()) - now.getTime()) / 1000)), "dispute window");
      await setState(db, p, "CLAIMABLE");
      const winners = await db.select({ userId: rewardAllocations.userId }).from(rewardAllocations).where(eq(rewardAllocations.rewardPeriodId, p.id));
      for (const w of winners) {
        await db
          .insert(notifications)
          .values({ userId: w.userId, kind: "reward_ready", title: "Your reward is ready to claim", body: `A reward from "${c.title}" can now be claimed.`, link: "/me/rewards", dedupeKey: `reward_ready:${p.id}` })
          .onConflictDoNothing();
      }
      return "claimable";
    }

    case "CLAIMABLE": {
      if (!p.claimDeadline || p.claimDeadline > now) throw new RetryLater(Math.max(60, Math.ceil(((p.claimDeadline?.getTime() ?? now.getTime()) - now.getTime()) / 1000)), "claim window open");
      await runOnce(db, ctx.signer, `period:${p.id}:close`, "close_period", c.id, vault.contractId, { methodName: "close_period", args: { campaign_id: vid.toString(), period_id: p.periodNumber }, gasTgas: 30 }, async () => (await onchain())?.status === "Closed");
      await setState(db, p, "COMPLETED");
      return "completed";
    }
    default:
      return `no action in ${p.state}`;
  }
}

function minBig(a: bigint, b: bigint) {
  return a < b ? a : b;
}

async function notifySponsor(db: Db, c: typeof campaigns.$inferSelect, title: string, body: string) {
  await db
    .insert(notifications)
    .values({ userId: c.createdBy, kind: "organizer_action", title, body, link: `/organizer/campaigns/${c.id}`, dedupeKey: `${title}:${c.id}:${new Date().toISOString().slice(0, 10)}` })
    .onConflictDoNothing();
}
