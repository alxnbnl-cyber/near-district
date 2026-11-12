import { and, campaigns, count, eq, finalizeSealedEntry, participantEntries, qualifications, rewardAllocations, rewardClaims, rewardPeriods, walletConnections } from "@yielvy/db";
import { z } from "zod";
import { badRequest, body, notFound, route } from "@/server/http";
import { db } from "@/server/db";
import { demoEnabled } from "@/server/demo";
import { currentRules } from "@/server/campaigns";
import { env } from "@/server/env";
import { audit } from "@/server/audit";

const input = z.object({ campaignId: z.string().uuid(), action: z.enum(["deadline", "reward"]) });

/** Demo payouts use their own reward record, so they never clash with the real one at the deadline. */
const DEMO_PERIOD = 999;

/**
 * LOCAL DEMO ONLY (DEMO_REWARDS=1, never in production). Fast-forwards a mission FOR THE CALLER ONLY;
 * the mission stays live for every other player.
 *   deadline: scores the caller's sealed answers now, locks them and shows their results.
 *   reward:   records the caller's share of the prize as paid, if they qualified. No funds move.
 */
export const POST = route(
  async (req, { user }) => {
    if (!demoEnabled()) throw notFound();
    const { campaignId, action } = await body(req, input);
    const database = await db();
    const [c] = await database.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!c || !c.currentVersion) throw notFound("Mission not found.");
    const [entry] = await database
      .select()
      .from(participantEntries)
      .where(and(eq(participantEntries.campaignId, c.id), eq(participantEntries.userId, user!.userId)))
      .limit(1);
    if (!entry) throw badRequest("Start the mission first.");
    const now = new Date();

    if (action === "deadline") {
      if (!entry.demoEndedAt) await database.update(participantEntries).set({ demoEndedAt: now }).where(eq(participantEntries.id, entry.id));
      const r = await finalizeSealedEntry(database, c.id, entry.id, now);
      await audit(database, { actorUserId: user!.userId, action: "demo.simulate_deadline", targetType: "campaign", targetId: c.id, metadata: r });
      return { ok: true, ...r };
    }

    // reward: only after this player's (or the real) deadline, and only if they qualified
    const ended = Boolean(entry.demoEndedAt) || Boolean(c.endsAt && c.endsAt <= now);
    if (!ended) throw badRequest("Simulate the deadline first.");
    const [mine] = await database
      .select({ id: qualifications.id })
      .from(qualifications)
      .where(and(eq(qualifications.campaignId, c.id), eq(qualifications.userId, user!.userId), eq(qualifications.status, "qualified")))
      .limit(1);
    if (!mine) return { ok: true, paid: 0, message: "You didn't decrypt every secret, so there's no reward this time." };

    const network = env().NEAR_NETWORK;
    const [wallet] = await database
      .select({ a: walletConnections.accountId })
      .from(walletConnections)
      .where(and(eq(walletConnections.userId, user!.userId), eq(walletConnections.network, network)))
      .limit(1);
    const accountId = wallet?.a ?? `demo-${user!.userId.slice(0, 8)}`;
    // equal share among everyone qualified so far
    const [{ n } = { n: 1 }] = await database.select({ n: count() }).from(qualifications).where(and(eq(qualifications.campaignId, c.id), eq(qualifications.status, "qualified")));
    const rules = await currentRules(database, c);
    const pool = rules?.plannedDirectBudget ? BigInt(rules.plannedDirectBudget) : 0n;
    const share = pool / BigInt(Math.max(1, n));

    const paid = await database.transaction(async (tx) => {
      let [period] = await tx.select().from(rewardPeriods).where(and(eq(rewardPeriods.campaignId, c.id), eq(rewardPeriods.periodNumber, DEMO_PERIOD))).limit(1);
      if (!period) {
        [period] = await tx
          .insert(rewardPeriods)
          .values({ campaignId: c.id, periodNumber: DEMO_PERIOD, startsAt: c.startsAt ?? now, endsAt: now, state: "COMPLETED", claimableAfter: now, claimDeadline: new Date(now.getTime() + 30 * 86_400_000) })
          .returning();
      }
      const [alloc] = await tx
        .insert(rewardAllocations)
        .values({ rewardPeriodId: period!.id, userId: user!.userId, accountId, amount: share, proof: [] })
        .onConflictDoNothing()
        .returning();
      if (!alloc) return false;
      await tx.insert(rewardClaims).values({ allocationId: alloc.id, state: "CONFIRMED", txHash: "demo-simulated", submittedAt: now, confirmedAt: now }).onConflictDoNothing();
      return true;
    });
    if (!paid) return { ok: true, paid: 1, message: "Your reward was already paid." };
    await audit(database, { actorUserId: user!.userId, action: "demo.simulate_reward", targetType: "campaign", targetId: c.id, metadata: { share: share.toString() } });
    return { ok: true, paid: 1 };
  },
  { auth: "required" },
);
