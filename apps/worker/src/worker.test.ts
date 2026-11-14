/**
 * Queue semantics run on real Postgres (PGlite). The reward driver runs against a FAKE in-memory
 * prize vault + signer: it verifies the driver's state machine, idempotency and payout bookkeeping only.
 * Real contract behaviour is covered by contracts/prize-vault tests; real chain runs by the testnet/
 * mainnet procedures in docs/operations.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@near-district/db/testing";
import {
  blockchainOperations,
  campaigns,
  campaignVersions,
  eq,
  jobs,
  organizations,
  participantEntries,
  qualifications,
  sealedAnswers,
  treasureQuestions,
  rewardAllocations,
  rewardClaims,
  rewardPeriods,
  spaces,
  users,
  walletConnections,
  type DbHandle,
} from "@near-district/db";
import type { CampaignRules } from "@near-district/core";
import type { VaultClient, VaultMission, VaultWinner } from "@near-district/near";
import { backoffSeconds, claim, complete, enqueue, fail } from "./queue";
import { processPeriod } from "./rewards";
import { RetryLater } from "./queue";
import type { OperatorSigner } from "./operator";

let h: DbHandle;
beforeAll(async () => {
  h = await createTestDb();
});
afterAll(async () => h?.close());

describe("job queue", () => {
  it("dedupes by idempotency key while pending", async () => {
    expect(await enqueue(h.db, "x", {}, { idempotencyKey: "k1" })).toBe(true);
    expect(await enqueue(h.db, "x", {}, { idempotencyKey: "k1" })).toBe(false);
  });
  it("never hands the same job to two workers", async () => {
    await enqueue(h.db, "y", { n: 1 });
    const [a, b] = await Promise.all([claim(h.db, "w1", 10), claim(h.db, "w2", 10)]);
    const ids = [...a, ...b].map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("backs off, then dead-letters after max attempts", async () => {
    await h.db.delete(jobs);
    await enqueue(h.db, "z", {}, { maxAttempts: 2 });
    let [j] = await claim(h.db, "w", 1);
    expect(await fail(h.db, j!, new Error("boom"))).toBe("retry");
    await h.db.update(jobs).set({ runAt: new Date(0) });
    [j] = await claim(h.db, "w", 1);
    expect(j!.attempts).toBe(2);
    expect(await fail(h.db, j!, new Error("boom again"))).toBe("dead");
    const [row] = await h.db.select().from(jobs);
    expect(row!.status).toBe("dead");
    expect(row!.lastError).toMatch(/boom again/);
    expect(backoffSeconds(1)).toBe(15);
    expect(backoffSeconds(20)).toBe(1800);
  });
  it("reclaims jobs from a crashed worker after the lock expires", async () => {
    await h.db.delete(jobs);
    await enqueue(h.db, "crash", {});
    const [j] = await claim(h.db, "dead-worker", 1, 1);
    await h.db.update(jobs).set({ lockedUntil: new Date(Date.now() - 1000) });
    const [again] = await claim(h.db, "w2", 1);
    expect(again?.id).toBe(j!.id);
    await complete(h.db, again!.id);
  });
});

// ------------------------------------------------------------------ fake prize vault

/** Mirrors contracts/prize-vault: finalize fixes equal shares, payout pays in batches of 10, remainder refunds. */
function fakeVault(prize: bigint, opts: { failFirstPayoutFor?: string } = {}) {
  const deadlinePast = ((BigInt(Date.now()) - 1000n) * 1_000_000n).toString();
  const m: VaultMission = {
    mission_id: "7", sponsor: "sponsor.near", deadline_ns: deadlinePast, prize: prize.toString(), status: "Open", winner_count: 0,
    share: "0", next_index: 0, paid_count: 0, paid_total: "0", refund_owed: "0", refunded_total: "0",
  };
  let winners: VaultWinner[] = [];
  const registered = new Set<string>();
  const calls: string[] = [];
  let failed = false;
  const logEv = (event: string, data: object) => `EVENT_JSON:${JSON.stringify({ standard: "near_district_prize_vault", version: "1.0.0", event, data: [data] })}`;
  const pay = (w: VaultWinner, logs: string[]) => {
    if (opts.failFirstPayoutFor === w.account_id && !failed) {
      failed = true;
      w.state = "Failed";
      logs.push(logEv("reward_failed", { mission_id: "7", account_id: w.account_id, amount: m.share, index: w.index }));
      return;
    }
    w.state = "Paid";
    m.paid_count++;
    m.paid_total = (BigInt(m.paid_total) + BigInt(m.share)).toString();
    logs.push(logEv("reward_paid", { mission_id: "7", account_id: w.account_id, amount: m.share, index: w.index }));
    if (m.paid_count === m.winner_count) m.status = "Completed";
  };
  const vault = {
    contractId: "vault.near",
    async mission() { return { ...m }; },
    async winners() { return winners.map((w) => ({ ...w })); },
  } as unknown as VaultClient;
  const signer: OperatorSigner = {
    accountId: "operator.near",
    async call(contract, c) {
      calls.push(c.methodName);
      const a = c.args as { winners?: string[]; indexes?: number[]; account_id?: string };
      const logs: string[] = [];
      if (c.methodName === "storage_deposit") registered.add(a.account_id!);
      else if (c.methodName === "finalize") {
        if (m.status !== "Open") throw new Error("Mission already finalized");
        const n = a.winners!.length;
        if (c.depositYocto !== 1_500_000_000_000_000_000_000n * BigInt(n)) throw new Error("wrong storage deposit");
        if (n === 0) { m.status = "Refunded"; m.refund_owed = m.prize; }
        else {
          const share = prize / BigInt(n);
          m.status = "Paying"; m.winner_count = n; m.share = share.toString(); m.refund_owed = (prize - share * BigInt(n)).toString();
          winners = a.winners!.map((acc, index) => ({ index, account_id: acc, state: "Pending" }));
        }
      } else if (c.methodName === "payout") {
        while (m.next_index < m.winner_count && logs.length < 10) pay(winners[m.next_index++]!, logs);
      } else if (c.methodName === "retry_payouts") {
        for (const i of a.indexes!) pay(winners[i]!, logs);
      } else if (c.methodName === "withdraw_refund") {
        m.refunded_total = (BigInt(m.refunded_total) + BigInt(m.refund_owed)).toString();
        logs.push(logEv("refund_sent", { mission_id: "7", sponsor: "sponsor.near", amount: m.refund_owed }));
        m.refund_owed = "0";
      }
      void contract;
      return { txHash: `TxHash${String(calls.length).padStart(38, "1")}`, success: true, logs };
    },
  };
  const rpc = { async view<T>(_c: string, method: string, args?: { account_id?: string }) { return (method === "storage_balance_of" ? (registered.has(args!.account_id!) ? { total: "1" } : null) : null) as T; } };
  return { vault, signer, calls, rpc, mission: m };
}

let nextVaultId = 7n;
async function seedMission(network: string, slug: string, players: [string, string | null][]) {
  const [u] = await h.db.insert(users).values({ displayName: `org-${slug}` }).returning();
  const [o] = await h.db.insert(organizations).values({ name: slug, slug, createdBy: u!.id, status: "approved" }).returning();
  const [s] = await h.db.insert(spaces).values({ organizationId: o!.id, name: slug, slug, category: "puzzle", moderation: "approved" }).returning();
  const rules: CampaignRules = {
    template: "treasure_hunt", startsAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), endsAt: new Date(Date.now() - 1000).toISOString(),
    eligibility: { requireVerifiedPayout: true, blockedJurisdictions: [] }, fundingSource: "direct",
    reward: { mode: "equal", winnersCount: 1, tieBreak: "earliest_completion", minPayout: "1" }, periods: 1, claimWindowDays: 30,
  };
  const [c] = await h.db.insert(campaigns).values({ spaceId: s!.id, template: "treasure_hunt", title: slug, slug, network, createdBy: u!.id, status: "ENDED", currentVersion: 1, vaultCampaignId: nextVaultId++, startsAt: new Date(rules.startsAt), endsAt: new Date(rules.endsAt) }).returning();
  await h.db.insert(campaignVersions).values({ campaignId: c!.id, version: 1, rules, rulesHash: "x", createdBy: u!.id });
  const [p] = await h.db.insert(rewardPeriods).values({ campaignId: c!.id, periodNumber: 1, startsAt: new Date(rules.startsAt), endsAt: new Date(rules.endsAt) }).returning();
  for (const [name, wallet] of players) {
    const [pl] = await h.db.insert(users).values({ displayName: name }).returning();
    await h.db.insert(qualifications).values({ campaignId: c!.id, userId: pl!.id, score: 100, qualifiedAt: new Date(), status: "qualified" });
    if (wallet) await h.db.insert(walletConnections).values({ userId: pl!.id, network, accountId: wallet, publicKey: "ed25519:x", isPayout: true, verifiedAt: new Date() });
  }
  return { rules, period: p! };
}

describe("prize payout driver", () => {
  it("freezes winners, finalizes equal shares, pays everyone and refunds the remainder", async () => {
    const { rules, period } = await seedMission("mainnet", "m1", [["a", "alice.near"], ["b", "bob.near"], ["c", null]]);
    const fv = fakeVault(1_000_001n, { failFirstPayoutFor: "bob.near" });
    const ctx = { db: h.db, vault: fv.vault, signer: fv.signer, network: "mainnet", token: { contractId: "usdc.near", storageDepositYocto: 1n }, rpc: fv.rpc, rulesFor: async () => rules };
    expect(await processPeriod(ctx, period.id)).toBe("frozen with 2 winner(s)"); // player c has no payout wallet: excluded
    expect(await processPeriod(ctx, period.id)).toBe("finalized 2 winner(s), 500000 each");
    // first batch: alice paid, bob's transfer fails, then the driver retries it
    await expect(processPeriod(ctx, period.id)).rejects.toBeInstanceOf(RetryLater);
    expect(await processPeriod(ctx, period.id)).toBe("completed: 2 paid");
    expect(fv.calls).toEqual(["storage_deposit", "storage_deposit", "finalize", "payout", "retry_payouts", "withdraw_refund"]);
    expect(fv.mission.refunded_total).toBe("1"); // 1,000,001 split two ways: 1 unit back to the project
    const allocs = await h.db.select().from(rewardAllocations).where(eq(rewardAllocations.rewardPeriodId, period.id));
    expect(allocs.map((a) => a.accountId).sort()).toEqual(["alice.near", "bob.near"]);
    expect(allocs.every((a) => a.amount === 500_000n)).toBe(true);
    const claims = await h.db.select().from(rewardClaims);
    const mine = claims.filter((cl) => allocs.some((a) => a.id === cl.allocationId));
    expect(mine.every((cl) => cl.state === "CONFIRMED" && cl.txHash?.startsWith("TxHash"))).toBe(true);
    const [after] = await h.db.select().from(rewardPeriods).where(eq(rewardPeriods.id, period.id));
    expect(after!.state).toBe("COMPLETED");
    const ops = await h.db.select().from(blockchainOperations);
    expect(ops.every((o) => o.status === "succeeded")).toBe(true);
  });

  it("scores sealed answers itself, so a winner is never missed if the payout runs before the campaign tick", async () => {
    // no qualification rows yet: the player's sealed answers are only scored at the deadline
    const { rules, period } = await seedMission("testnet", "m3", []);
    const [player] = await h.db.insert(users).values({ displayName: "early" }).returning();
    await h.db.insert(walletConnections).values({ userId: player!.id, network: "testnet", accountId: "early.testnet", publicKey: "ed25519:x", isPayout: true, verifiedAt: new Date() });
    const [q] = await h.db.insert(treasureQuestions).values({ campaignId: period.campaignId, position: 1, type: "short_text", prompt: "?" }).returning();
    const [e] = await h.db.insert(participantEntries).values({ campaignId: period.campaignId, userId: player!.id, rulesVersion: 1 }).returning();
    await h.db.insert(sealedAnswers).values({ entryId: e!.id, questionId: q!.id, answerCipher: "x", correct: true, submissionDigest: "d" });
    const fv = fakeVault(20n);
    const ctx = { db: h.db, vault: fv.vault, signer: fv.signer, network: "testnet", token: { contractId: "usdc.near", storageDepositYocto: 1n }, rpc: fv.rpc, rulesFor: async () => rules };
    expect(await processPeriod(ctx, period.id)).toBe("frozen with 1 winner(s)");
    expect(await processPeriod(ctx, period.id)).toBe("finalized 1 winner(s), 20 each");
  });

  it("refunds the whole prize when nobody qualified", async () => {
    const { rules, period } = await seedMission("testnet", "m2", [["d", null]]);
    const fv = fakeVault(300n);
    const ctx = { db: h.db, vault: fv.vault, signer: fv.signer, network: "testnet", token: { contractId: "usdc.near", storageDepositYocto: 1n }, rpc: fv.rpc, rulesFor: async () => rules };
    expect(await processPeriod(ctx, period.id)).toBe("frozen with 0 winner(s)");
    expect(await processPeriod(ctx, period.id)).toBe("no winners, refunded");
    expect(fv.calls).toEqual(["finalize", "withdraw_refund"]);
    expect(fv.mission.refunded_total).toBe("300");
  });

  it("does not resubmit when a step already took effect on-chain", async () => {
    const { signer, calls } = fakeVault(10n);
    const { runOnce } = await import("./operator");
    const r = await runOnce(h.db, signer, "test:already", "finalize", null, "vault.near", { methodName: "finalize", args: {}, gasTgas: 1 }, async () => true);
    expect(r.skipped).toBe(true);
    expect(calls).toEqual([]);
  });
});
