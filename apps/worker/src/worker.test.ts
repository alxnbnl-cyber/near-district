/**
 * Queue semantics run on real Postgres (PGlite). The reward driver runs against a FAKE in-memory
 * vault + signer: it verifies the driver's state machine, idempotency and allocation logic only.
 * Real contract behaviour is covered by contracts/vault tests; real chain runs by the testnet/
 * mainnet procedures in docs/operations.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@yielvy/db/testing";
import {
  blockchainOperations,
  campaigns,
  campaignVersions,
  eq,
  jobs,
  organizations,
  qualifications,
  rewardAllocations,
  rewardPeriods,
  spaces,
  users,
  walletConnections,
  type DbHandle,
} from "@yielvy/db";
import { buildMerkleTree, verifyProof, type CampaignRules } from "@yielvy/core";
import type { VaultClient, VaultPeriod, VaultCampaign } from "@yielvy/near";
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

// ------------------------------------------------------------------ fake vault

function fakeVault(bonus: bigint, cap: bigint) {
  const periods = new Map<number, VaultPeriod>();
  const camp: VaultCampaign = {
    sponsor: "sponsor.near", status: "Active", principal_idle: "0", principal_supplied: "0", rhea_shares: "0",
    yield_available: "0", bonus_available: bonus.toString(), reserved: "0", claimed_total: "0", yield_realized_total: "0",
    max_operator_reserve_per_period: cap.toString(), require_sponsor_finalize: false, random_enabled: false, created_at: "0",
  };
  const calls: string[] = [];
  const vault = {
    contractId: "vault.near",
    async totals() { return { campaigns: "1", total_rhea_shares: "0", liquid_tracked: "0", fees_accrued: "0", pending_op: null }; },
    async campaign() { return camp; },
    async period(_c: bigint, id: number) { return periods.get(id) ?? null; },
  } as unknown as VaultClient;
  const signer: OperatorSigner = {
    accountId: "operator.near",
    async call(_contract, c) {
      calls.push(c.methodName);
      const a = c.args as Record<string, string>;
      const pid = Number(a.period_id);
      if (c.methodName === "commit_period") {
        periods.set(pid, { status: "Committed", eligibility_root: a.eligibility_root!, eligible_count: Number(a.eligible_count), committed_height: "1", seed: null, reserved_yield: "0", reserved_bonus: "0", allocation_root: null, allocated_total: "0", claimed_amount: "0", claimable_after: "0", claim_deadline: "0" });
      } else if (c.methodName === "reserve_for_period") {
        const p = periods.get(pid)!;
        const b = BigInt(a.from_bonus!);
        if (b > BigInt(camp.max_operator_reserve_per_period)) throw new Error("ERR_OPERATOR_RESERVE_CAP");
        p.reserved_bonus = b.toString();
        camp.bonus_available = (BigInt(camp.bonus_available) - b).toString();
      } else if (c.methodName === "finalize_period") {
        const p = periods.get(pid)!;
        p.status = "Finalized";
        p.allocation_root = a.allocation_root!;
        p.allocated_total = a.allocated_total!;
        const now = BigInt(Date.now()) * 1_000_000n;
        p.claimable_after = (now - 1n).toString();
        p.claim_deadline = (now + 86_400_000_000_000n).toString();
      }
      return { txHash: `tx${calls.length}`, success: true, logs: [] };
    },
  };
  return { vault, signer, calls, periods };
}

describe("reward period driver", () => {
  it("freezes, commits, reserves, allocates and finalizes exactly once", async () => {
    const [u] = await h.db.insert(users).values({ displayName: "org" }).returning();
    const [o] = await h.db.insert(organizations).values({ name: "o", slug: "o", createdBy: u!.id, status: "approved" }).returning();
    const [s] = await h.db.insert(spaces).values({ organizationId: o!.id, name: "s", slug: "s", category: "puzzle", moderation: "approved" }).returning();
    const rules: CampaignRules = {
      template: "treasure_hunt", startsAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), endsAt: new Date(Date.now() - 1000).toISOString(),
      eligibility: { requireVerifiedPayout: true, blockedJurisdictions: [] }, fundingSource: "direct",
      reward: { mode: "equal", winnersCount: 1, tieBreak: "earliest_completion", minPayout: "1" }, periods: 1, claimWindowDays: 30,
    };
    const [c] = await h.db.insert(campaigns).values({ spaceId: s!.id, template: "treasure_hunt", title: "t", slug: "t", network: "mainnet", createdBy: u!.id, status: "ENDED", currentVersion: 1, vaultCampaignId: 7n }).returning();
    await h.db.insert(campaignVersions).values({ campaignId: c!.id, version: 1, rules, rulesHash: "x", createdBy: u!.id });
    const [p] = await h.db.insert(rewardPeriods).values({ campaignId: c!.id, periodNumber: 1, startsAt: new Date(rules.startsAt), endsAt: new Date(rules.endsAt) }).returning();
    // three qualified players, one without a payout wallet (excluded honestly)
    for (const [name, wallet] of [["a", "alice.near"], ["b", "bob.near"], ["c", null]] as const) {
      const [pl] = await h.db.insert(users).values({ displayName: name }).returning();
      await h.db.insert(qualifications).values({ campaignId: c!.id, userId: pl!.id, score: 100, qualifiedAt: new Date(), status: "qualified" });
      if (wallet) await h.db.insert(walletConnections).values({ userId: pl!.id, network: "mainnet", accountId: wallet, publicKey: "ed25519:x", isPayout: true, verifiedAt: new Date() });
    }

    const { vault, signer, calls } = fakeVault(1_000_001n, 10_000_000n);
    const ctx = { db: h.db, vault, signer, network: "mainnet", rulesFor: async () => rules };
    expect(await processPeriod(ctx, p!.id)).toBe("frozen");
    expect(await processPeriod(ctx, p!.id)).toBe("no harvest needed");
    expect(await processPeriod(ctx, p!.id)).toBe("reserved");
    expect(await processPeriod(ctx, p!.id)).toBe("finalized");
    expect(await processPeriod(ctx, p!.id)).toBe("claimable");
    await expect(processPeriod(ctx, p!.id)).rejects.toBeInstanceOf(RetryLater); // claim window open

    expect(calls).toEqual(["commit_period", "reserve_for_period", "finalize_period"]);
    const allocs = await h.db.select().from(rewardAllocations).where(eq(rewardAllocations.rewardPeriodId, p!.id));
    expect(allocs.map((a) => a.accountId).sort()).toEqual(["alice.near", "bob.near"]);
    expect(allocs.every((a) => a.amount === 500_000n)).toBe(true); // 1,000,001 split two ways, 1 unit of dust stays
    const [period] = await h.db.select().from(rewardPeriods).where(eq(rewardPeriods.id, p!.id));
    for (const a of allocs) {
      expect(verifyProof({ campaignId: "7", periodId: "1", accountId: a.accountId, amount: a.amount }, a.proof, period!.allocationRoot!)).toBe(true);
    }
    // the same root the contract would verify
    expect(buildMerkleTree(allocs.map((a) => ({ campaignId: "7", periodId: "1", accountId: a.accountId, amount: a.amount }))).root).toBe(period!.allocationRoot);
    const ops = await h.db.select().from(blockchainOperations);
    expect(ops.every((o) => o.status === "succeeded")).toBe(true);
  });

  it("does not resubmit when a step already took effect on-chain", async () => {
    const { vault, signer, calls, periods } = fakeVault(10n, 10n);
    periods.set(9, { status: "Committed", eligibility_root: "abc", eligible_count: 1, committed_height: "1", seed: null, reserved_yield: "0", reserved_bonus: "5", allocation_root: null, allocated_total: "0", claimed_amount: "0", claimable_after: "0", claim_deadline: "0" });
    const { runOnce } = await import("./operator");
    const r = await runOnce(h.db, signer, "test:already", "reserve_for_period", null, "vault.near", { methodName: "reserve_for_period", args: {}, gasTgas: 1 }, async () => true);
    expect(r.skipped).toBe(true);
    expect(calls).toEqual([]);
    void vault;
  });
});
