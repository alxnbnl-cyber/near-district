import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./testing";
import {
  auditLogs,
  campaigns,
  eligibilitySnapshots,
  eq,
  ledgerEntries,
  organizations,
  rewardPeriods,
  spaces,
  sql,
  users,
  worldBuildings,
  type DbHandle,
} from "./index";

let h: DbHandle;

/** Drizzle wraps driver errors; the Postgres message lives on error.cause. */
async function expectDbError(p: Promise<unknown>, re: RegExp = /./) {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err, "expected the query to fail").toBeDefined();
  const msgs: string[] = [];
  for (let e = err as { message?: string; cause?: unknown } | undefined; e; e = e.cause as typeof e) msgs.push(String(e.message));
  expect(msgs.join(" | ")).toMatch(re);
}

beforeAll(async () => {
  h = await createTestDb();
}, 60_000);
afterAll(async () => h?.close());

describe("schema constraints", () => {
  it("stores amounts beyond 64-bit exactly", async () => {
    const big = 2n ** 100n + 1n;
    await h.db.insert(ledgerEntries).values({ bucket: "fees", delta: big, eventType: "t", eventRef: "ref-big", txHash: "x" });
    const [row] = await h.db.select().from(ledgerEntries).where(eq(ledgerEntries.eventRef, "ref-big"));
    expect(row!.delta).toBe(big);
  });

  it("ledger is append-only and idempotent by event ref", async () => {
    await h.db.insert(ledgerEntries).values({ bucket: "fees", delta: 1n, eventType: "t", eventRef: "ref-1", txHash: "x" });
    await expectDbError(h.db.insert(ledgerEntries).values({ bucket: "fees", delta: 1n, eventType: "t", eventRef: "ref-1", txHash: "x" }), /unique|duplicate/i);
    await expectDbError(h.db.update(ledgerEntries).set({ delta: 999n }).where(eq(ledgerEntries.eventRef, "ref-1")), /append-only/);
    await expectDbError(h.db.delete(ledgerEntries).where(eq(ledgerEntries.eventRef, "ref-1")), /append-only/);
  });

  it("audit log cannot be rewritten", async () => {
    await h.db.insert(auditLogs).values({ action: "test" });
    await expectDbError(h.db.execute(sql`delete from audit_logs`), /append-only/);
  });

  it("enforces one building per plot and one space per org", async () => {
    const [u] = await h.db.insert(users).values({ displayName: "u" }).returning();
    const mk = async (slug: string) => {
      const [o] = await h.db.insert(organizations).values({ name: slug, slug, createdBy: u!.id }).returning();
      const [s] = await h.db.insert(spaces).values({ organizationId: o!.id, name: slug, slug, category: "project" }).returning();
      return { o: o!, s: s! };
    };
    const a = await mk("a");
    const b = await mk("b");
    await h.db.insert(worldBuildings).values({ spaceId: a.s.id, districtId: "discovery", plotIndex: 0 });
    await expectDbError(h.db.insert(worldBuildings).values({ spaceId: b.s.id, districtId: "discovery", plotIndex: 0 }), /unique|duplicate/i);
    await expectDbError(h.db.insert(spaces).values({ organizationId: a.o.id, name: "dup", slug: "dup", category: "project" }), /unique|duplicate/i);
  });

  it("freezes eligibility snapshots", async () => {
    const [u] = await h.db.select().from(users).limit(1);
    const [s] = await h.db.select().from(spaces).limit(1);
    const [c] = await h.db
      .insert(campaigns)
      .values({ spaceId: s!.id, template: "treasure_hunt", title: "t", slug: "t", network: "testnet", createdBy: u!.id })
      .returning();
    const [p] = await h.db
      .insert(rewardPeriods)
      .values({ campaignId: c!.id, periodNumber: 1, startsAt: new Date(), endsAt: new Date() })
      .returning();
    const [snap] = await h.db
      .insert(eligibilitySnapshots)
      .values({ rewardPeriodId: p!.id, commitment: "abc", participantCount: 1, participants: [] })
      .returning();
    // Recording the on-chain commit tx is allowed; changing the frozen set is not.
    await h.db.update(eligibilitySnapshots).set({ commitTxHash: "tx" }).where(eq(eligibilitySnapshots.id, snap!.id));
    await expectDbError(
      h.db.update(eligibilitySnapshots).set({ participantCount: 2 }).where(eq(eligibilitySnapshots.id, snap!.id)),
      /immutable/,
    );
    await expectDbError(h.db.delete(eligibilitySnapshots).where(eq(eligibilitySnapshots.id, snap!.id)), /append-only/);
  });
});
