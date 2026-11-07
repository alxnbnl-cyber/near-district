/**
 * Campaign engine integration tests on real Postgres semantics (PGlite, fully migrated).
 * No mocks of our own code: these exercise the same services the API routes call.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@yielvy/db/testing";
import { campaigns, eq, organizations, qualifications, spaces, treasureAnswerRules, users, type DbHandle, and, participantEntries } from "@yielvy/db";
import { addQuestion, checkPublishable, createDraft, publishCampaign, reorderQuestions, updateCampaign, listQuestions } from "./campaigns";
import { getPlayState, joinCampaign, submitAnswer } from "./play";
import { listSubmissions, reviewSubmission, selectWinners, submitEntry, toCsv } from "./contest";
import { createSpace } from "./spaces";
import { HttpError } from "./http";
import type { SessionUser } from "./session";

let h: DbHandle;
let organizer: SessionUser;
let player: SessionUser;
let player2: SessionUser;
let spaceId: string;

async function mkUser(name: string, wallet: string | null): Promise<SessionUser> {
  const [u] = await h.db.insert(users).values({ displayName: name }).returning();
  return { sessionId: "s", userId: u!.id, displayName: name, email: null, status: "active", walletVerifiedAt: new Date(), payoutAccountId: wallet, adminRoles: [] };
}

async function expectHttp(p: Promise<unknown>, status: number, re?: RegExp) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).status).toBe(status);
    if (re) expect((e as HttpError).message).toMatch(re);
    return;
  }
  throw new Error("expected HttpError");
}

beforeAll(async () => {
  h = await createTestDb();
  organizer = await mkUser("org", "org.near");
  player = await mkUser("p1", "p1.near");
  player2 = await mkUser("p2", null);
  const { space } = await createSpace(h.db, organizer, {
    organizationName: "Example Labs",
    name: "Example Labs",
    slug: "example-labs",
    category: "puzzle",
    tagline: "We hide things",
    description: "",
    socials: {},
    buildingStyle: "observatory",
  });
  spaceId = space.id;
});
afterAll(async () => h?.close());

describe("spaces", () => {
  it("requires a verified wallet and assigns a deterministic plot", async () => {
    const noWallet = await mkUser("nowallet", null);
    await expectHttp(
      createSpace(h.db, noWallet, { organizationName: "X", name: "X Space", slug: "x-space", category: "dao", tagline: "", description: "", socials: {}, buildingStyle: "tower" }),
      403,
    );
    const [s] = await h.db.select().from(spaces).where(eq(spaces.id, spaceId));
    expect(s!.moderation).toBe("pending");
  });
  it("prevents a second Space per organizer and duplicate slugs", async () => {
    await expectHttp(
      createSpace(h.db, organizer, { organizationName: "Y", name: "Y", slug: "y-space", category: "dao", tagline: "", description: "", socials: {}, buildingStyle: "tower" }),
      409,
    );
    const other = await mkUser("other", "other.near");
    await expectHttp(
      createSpace(h.db, other, { organizationName: "Z", name: "Z", slug: "example-labs", category: "dao", tagline: "", description: "", socials: {}, buildingStyle: "tower" }),
      409,
    );
  });
});

describe("treasure hunt", () => {
  let campaignId: string;
  let qIds: string[];

  it("builds a draft with encrypted answer rules", async () => {
    const c = await createDraft(h.db, organizer, spaceId, { template: "treasure_hunt", title: "The Hidden Signal" });
    campaignId = c.id;
    await addQuestion(h.db, organizer, c, { type: "short_text", prompt: "What guides ships at night?", answers: ["Lighthouse", "a lighthouse"], difficulty: 1, maxAttempts: 3, cooldownSeconds: 0, caseSensitive: false, stripPunctuation: false, numericTolerance: "0" });
    await addQuestion(h.db, organizer, c, { type: "multiple_choice", prompt: "Pick blue", options: [{ id: "a", label: "Red" }, { id: "b", label: "Blue" }], correctOptionId: "b", difficulty: 2, maxAttempts: 5, cooldownSeconds: 0, caseSensitive: false, stripPunctuation: false, numericTolerance: "0" });
    await addQuestion(h.db, organizer, c, { type: "numeric", prompt: "Pi to two places", numericValue: "3.14", numericTolerance: "0.005", difficulty: 1, maxAttempts: 5, cooldownSeconds: 0, caseSensitive: false, stripPunctuation: false });
    const rules = await h.db.select().from(treasureAnswerRules);
    expect(JSON.stringify(rules)).not.toMatch(/lighthouse|3\.14|"b"/i);
    qIds = (await listQuestions(h.db, c.id)).map((q) => q.id);
    expect(qIds).toHaveLength(3);
  });

  it("reorders without breaking the unique position index", async () => {
    const [c] = await h.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    await reorderQuestions(h.db, organizer, c!, [qIds[1]!, qIds[0]!, qIds[2]!]);
    await reorderQuestions(h.db, organizer, c!, [qIds[0]!, qIds[1]!, qIds[2]!]);
    expect((await listQuestions(h.db, campaignId)).map((q) => q.id)).toEqual(qIds);
  });

  it("refuses to publish until the Space is approved and details are complete", async () => {
    const [c] = await h.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    const check = await checkPublishable(h.db, c!);
    expect(check.ok).toBe(false);
    expect(check.problems.join(" ")).toMatch(/approved/);
    await h.db.update(spaces).set({ moderation: "approved" }).where(eq(spaces.id, spaceId));
    await h.db.update(organizations).set({ status: "approved" });
    await updateCampaign(h.db, organizer, c!, {
      summary: "Find the signal hidden across our docs.",
      description: "Three questions lead you through our docs and community. Answer all of them to finish the hunt.",
      rules: { startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString() },
    });
  });

  it("will not publish reward-bearing campaigns without verified vault funding", async () => {
    const [c] = await h.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    await updateCampaign(h.db, organizer, c!, { rules: { fundingSource: "direct" } });
    const [c2] = await h.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    const check = await checkPublishable(h.db, c2!);
    expect(check.funding).toMatchObject({ required: true, verified: false });
    await expectHttp(publishCampaign(h.db, organizer, c2!), 422);
    await updateCampaign(h.db, organizer, c2!, { rules: { fundingSource: "none" } });
  });

  it("publishes as LIVE and locks questions", async () => {
    const [c] = await h.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    expect(await publishCampaign(h.db, organizer, c!)).toEqual({ status: "LIVE" });
    const [live] = await h.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    await expectHttp(addQuestion(h.db, organizer, live!, { type: "short_text", prompt: "late question", answers: ["x"], difficulty: 1, maxAttempts: 3, cooldownSeconds: 0, caseSensitive: false, stripPunctuation: false, numericTolerance: "0" }), 409);
  });

  it("blocks organizers from playing their own campaign", async () => {
    await expectHttp(joinCampaign(h.db, organizer, campaignId, null), 403, /Organizer/);
  });

  it("never sends answers to the player", async () => {
    await joinCampaign(h.db, player, campaignId, null);
    const state = await getPlayState(h.db, player, campaignId);
    const json = JSON.stringify(state);
    expect(json).not.toMatch(/lighthouse|digest|salt|ciphertext/i);
    expect(state.joined && state.question?.index).toBe(0);
  });

  it("rejects answers to a question other than the current one", async () => {
    await expectHttp(submitAnswer(h.db, player, campaignId, qIds[2]!, "3.14", null), 409, /current question/);
  });

  it("counts wrong attempts and enforces the limit", async () => {
    const r1 = await submitAnswer(h.db, player, campaignId, qIds[0]!, "a candle", null);
    expect(r1).toMatchObject({ correct: false, attemptsLeft: 2 });
    const r2 = await submitAnswer(h.db, player, campaignId, qIds[0]!, "  A   LIGHTHOUSE ", null);
    expect(r2).toMatchObject({ correct: true, completed: false });
  });

  it("serializes concurrent submissions so progress advances once", async () => {
    const results = await Promise.allSettled([
      submitAnswer(h.db, player, campaignId, qIds[1]!, "b", null),
      submitAnswer(h.db, player, campaignId, qIds[1]!, "b", null),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    const [entry] = await h.db.select().from(participantEntries).where(and(eq(participantEntries.campaignId, campaignId), eq(participantEntries.userId, player.userId)));
    expect(entry!.progress).toBe(2);
  });

  it("completes and qualifies (held for review when implausibly fast)", async () => {
    const r = await submitAnswer(h.db, player, campaignId, qIds[2]!, "3.141", null);
    expect(r).toMatchObject({ correct: true, completed: true, qualification: "held" });
    const [q] = await h.db.select().from(qualifications).where(eq(qualifications.userId, player.userId));
    expect(q!.status).toBe("held");
    expect(q!.score).toBe(90 + 200 + 100);
    await expectHttp(submitAnswer(h.db, player, campaignId, qIds[2]!, "3.14", null), 409, /finished/);
  });

  it("locks out a question after max attempts", async () => {
    await joinCampaign(h.db, player2, campaignId, null);
    for (let i = 0; i < 3; i++) await submitAnswer(h.db, player2, campaignId, qIds[0]!, `wrong ${i}`, null);
    await expectHttp(submitAnswer(h.db, player2, campaignId, qIds[0]!, "lighthouse", null), 409, /every attempt/);
  });

  it("blocks material rule changes once people have joined, allows extending", async () => {
    const [c] = await h.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    await expectHttp(updateCampaign(h.db, organizer, c!, { rules: { periods: 3 } }), 409, /disadvantage/);
    await expectHttp(updateCampaign(h.db, organizer, c!, { rules: { endsAt: new Date(Date.now() + 5 * 86_400_000).toISOString() } }), 400, /notice/);
    await updateCampaign(h.db, organizer, c!, { rules: { endsAt: new Date(Date.now() + 5 * 86_400_000).toISOString() } }, "We extended the hunt by a few days.");
    const [after] = await h.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    expect(after!.currentVersion).toBe(2);
  });
});

describe("creative contest", () => {
  let campaignId: string;
  it("accepts one entry per person while live", async () => {
    const c = await createDraft(h.db, organizer, spaceId, { template: "creative_contest", title: "Imagine our next product" });
    campaignId = c.id;
    await updateCampaign(h.db, organizer, c, {
      summary: "Pitch us an idea.",
      description: "Tell us what you would build next with our toolkit. The best ideas will be featured.",
      rules: { startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString() },
    });
    const [draft] = await h.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    await publishCampaign(h.db, organizer, draft!);
    await submitEntry(h.db, player, campaignId, { title: "Map-based onboarding", body: "A guided map that walks new users through the product step by step." }, null);
    await expectHttp(submitEntry(h.db, player, campaignId, { title: "Again", body: "A second idea from the same person should be rejected." }, null), 409);
    await submitEntry(h.db, player2, campaignId, { title: "=HYPERLINK(\"evil\")", body: "Testing that exports neutralise spreadsheet formulas safely." }, null);
  });

  it("computes weighted review scores and keeps history", async () => {
    const [c] = await h.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    const subs = await listSubmissions(h.db, campaignId);
    const target = subs.find((s) => s.title === "Map-based onboarding")!;
    const r = await reviewSubmission(h.db, organizer, c!, target.id, { scores: { originality: 9, usefulness: 8, clarity: 7 }, decision: "shortlist" });
    expect(r.weightedScore).toBe(820);
    await reviewSubmission(h.db, organizer, c!, target.id, { scores: { originality: 10, usefulness: 8, clarity: 7 }, decision: "none" });
    const after = (await listSubmissions(h.db, campaignId)).find((s) => s.id === target.id)!;
    expect(after.history).toHaveLength(2);
    expect(after.averageScore).toBe(860);
    expect(after.status).toBe("shortlisted");
  });

  it("only selects winners after the deadline, exactly once", async () => {
    const [c] = await h.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    const subs = await listSubmissions(h.db, campaignId);
    await expectHttp(selectWinners(h.db, organizer, c!, [subs[0]!.id]), 409, /closes/);
    await h.db.update(campaigns).set({ endsAt: new Date(Date.now() - 1000) }).where(eq(campaigns.id, campaignId));
    const [closed] = await h.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    await selectWinners(h.db, organizer, closed!, [subs.find((s) => s.title === "Map-based onboarding")!.id]);
    await expectHttp(selectWinners(h.db, organizer, closed!, [subs[0]!.id]), 409, /already/);
  });

  it("neutralises formula injection in CSV export", async () => {
    const csv = toCsv(await listSubmissions(h.db, campaignId));
    expect(csv).toContain(`"'=HYPERLINK(""evil"")"`);
  });
});
