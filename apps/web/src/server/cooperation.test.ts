/**
 * Acceptance scenarios for hint quests, partner cooperation and shared expeditions, on real Postgres
 * semantics (PGlite, fully migrated). Uses the same services the API routes call; no fake completions.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@near-district/db/testing";
import {
  activityCompletions,
  and,
  campaigns,
  eq,
  hintUnlocks,
  organizations,
  participantEntries,
  processVerification,
  qualifications,
  requestVerification,
  spaces,
  walletConnections,
  users,
  type DbHandle,
  type EngineDeps,
  finalizeSealedHunt,
} from "@near-district/db";
import type { RuleNode } from "@near-district/core";
import { addQuestion, checkPublishable, createDraft, listQuestions, publishCampaign, updateCampaign } from "./campaigns";
import { getPlayState, joinCampaign, submitAnswer } from "./play";
import { createSpace } from "./spaces";
import { actOnPartnership, createOffering, invitePartner, partnerOfferings } from "./partners";
import { decideReview, deleteHint, hintCards, listReviews, revealHint, saveHint, verifyHintActivity } from "./hints";
import {
  addOwnChapter,
  createExpedition,
  inviteExpeditionPartner,
  publicExpeditions,
  publishExpedition,
  respondExpeditionInvite,
  setRewardChapter,
} from "./expeditions";
import { HttpError } from "./http";
import type { SessionUser } from "./session";

let h: DbHandle;
const users_: Record<string, SessionUser> = {};
const orgs: Record<string, { orgId: string; spaceId: string }> = {};

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
  throw new Error(`expected HttpError ${status}`);
}

async function mkOrg(key: string, owner: SessionUser) {
  const { space } = await createSpace(h.db, owner, { organizationName: `${key} Labs`, name: `${key} Labs`, slug: `${key.toLowerCase()}-labs`, category: "puzzle", tagline: "", description: "", socials: {}, buildingStyle: "tower" });
  await h.db.update(spaces).set({ moderation: "approved" }).where(eq(spaces.id, space.id));
  await h.db.update(organizations).set({ status: "approved" }).where(eq(organizations.id, space.organizationId));
  orgs[key] = { orgId: space.organizationId, spaceId: space.id };
}

const textQ = (prompt: string, answer: string) => ({ type: "short_text" as const, prompt, answers: [answer], difficulty: 1, maxAttempts: 5, cooldownSeconds: 0, caseSensitive: false, stripPunctuation: false, numericTolerance: "0" });

async function campaign(id: string) {
  const [c] = await h.db.select().from(campaigns).where(eq(campaigns.id, id));
  return c!;
}

async function mkHunt(owner: SessionUser, key: string, title: string, qs: [string, string][]) {
  const c = await createDraft(h.db, owner, orgs[key]!.spaceId, { template: "treasure_hunt", title });
  for (const [p, a] of qs) await addQuestion(h.db, owner, c, textQ(p, a));
  await updateCampaign(h.db, owner, await campaign(c.id), {
    summary: `${title} summary`,
    description: "A real hunt used in the cooperation acceptance tests, with enough words to publish.",
    rules: { fundingSource: "none", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 7 * 86_400_000).toISOString() },
  });
  return c.id;
}

async function finishHunt(player: SessionUser, campaignId: string, answers: string[]) {
  await joinCampaign(h.db, player, campaignId, null);
  const qs = await listQuestions(h.db, campaignId);
  for (const [i, q] of qs.entries()) {
    const r = await submitAnswer(h.db, player, campaignId, q.id, answers[i]!, null);
    expect(r.saved).toBe(true);
  }
}

beforeAll(async () => {
  h = await createTestDb();
  for (const [k, w] of [["ownerA", "a.near"], ["ownerB", "b.near"], ["ownerC", "c.near"], ["player", "player.near"], ["player2", "p2.near"], ["player3", "p3.near"]] as const) users_[k] = await mkUser(k, w);
  await mkOrg("A", users_.ownerA!);
  await mkOrg("B", users_.ownerB!);
  await mkOrg("C", users_.ownerC!);
});
afterAll(async () => h?.close());

describe("partner hints: end-to-end acceptance", () => {
  let huntA: string;
  let quizB: string;
  let offeringB: string;
  let q1: string;
  let q2: string;
  let hint1: string;
  let hint2: string;
  let hintManual: string;
  let hintFreeOnWithdraw: string;

  it("1–4: two organizations; B publishes a learning quiz, A drafts a hunt", async () => {
    quizB = await mkHunt(users_.ownerB!, "B", "RHEA Learning Challenge", [["What does RHEA lend?", "tokens"]]);
    expect(await publishCampaign(h.db, users_.ownerB!, await campaign(quizB))).toEqual({ status: "LIVE" });
    huntA = await mkHunt(users_.ownerA!, "A", "The Lost Treasure", [["Which protocol powers the hidden vault?", "rhea"], ["Where is the map?", "harbor"]]);
    [q1, q2] = (await listQuestions(h.db, huntA)).map((q) => q.id) as [string, string];
  });

  it("5–6: A invites B; only B's admins can answer; B approves", async () => {
    const inv = await invitePartner(h.db, users_.ownerA!, orgs.A!.orgId, { organizationSlug: "b-labs", message: "Let's cooperate on The Lost Treasure" });
    await expectHttp(invitePartner(h.db, users_.ownerA!, orgs.A!.orgId, { organizationSlug: "b-labs", message: "" }), 409);
    await expectHttp(actOnPartnership(h.db, users_.ownerA!, orgs.A!.orgId, inv.id, "accept"), 403);
    await expectHttp(actOnPartnership(h.db, users_.ownerC!, orgs.C!.orgId, inv.id, "accept"), 404);
    await expectHttp(actOnPartnership(h.db, users_.player!, orgs.B!.orgId, inv.id, "accept"), 403);
    expect(await actOnPartnership(h.db, users_.ownerB!, orgs.B!.orgId, inv.id, "accept")).toEqual({ status: "ACCEPTED" });
  });

  it("B offers its quiz as an activity (and can't offer someone else's campaign)", async () => {
    await expectHttp(createOffering(h.db, users_.ownerB!, orgs.B!.orgId, { title: "Steal", description: "", activity: { type: "internal_quiz", campaignId: huntA } }, { onchainEnabled: true }), 400, /own company/);
    const o = await createOffering(h.db, users_.ownerB!, orgs.B!.orgId, { title: "Complete the RHEA Learning Challenge", description: "Learn how lending works.", activity: { type: "internal_quiz", campaignId: quizB } }, { onchainEnabled: true });
    offeringB = o.id;
    const visible = await partnerOfferings(h.db, orgs.A!.orgId);
    expect(visible.map((x) => x.id)).toEqual([offeringB]);
    expect(await partnerOfferings(h.db, orgs.C!.orgId)).toEqual([]);
  });

  it("7: A attaches B's activity to Hint 2; impersonation and non-partners are refused", async () => {
    const c = await campaign(huntA);
    hint1 = (await saveHint(h.db, users_.ownerA!, c, { questionId: q1, title: "A free nudge", teaser: "Free for everyone", content: "Think about lending.", unlock: null, withdrawalPolicy: "disable" })).id;
    const partnerRule: RuleNode = { kind: "group", op: "ANY", children: [{ kind: "activity", id: "rhea-quiz", ownerOrgId: orgs.B!.orgId, offeringId: offeringB, activity: { type: "internal_quiz", campaignId: quizB } }] };
    hint2 = (await saveHint(h.db, users_.ownerA!, c, { questionId: q1, title: "The Lending Secret", teaser: "Provided by B Labs", content: "The vault is powered by RHEA.", unlock: partnerRule, withdrawalPolicy: "disable" })).id;
    // Claiming B owns an activity without B's offering → server re-derives ownership and rejects B's campaign.
    const forged: RuleNode = { kind: "activity", id: "forged", ownerOrgId: orgs.B!.orgId, activity: { type: "internal_quiz", campaignId: quizB } };
    await expectHttp(saveHint(h.db, users_.ownerA!, c, { questionId: q1, title: "Forged", teaser: "", content: "x".repeat(5), unlock: forged, withdrawalPolicy: "disable" }), 400);
    // C has no partnership with B.
    const huntC = await mkHunt(users_.ownerC!, "C", "C hunt", [["q", "a"]]);
    const cRule: RuleNode = { kind: "activity", id: "b", ownerOrgId: orgs.B!.orgId, offeringId: offeringB, activity: { type: "internal_quiz", campaignId: quizB } };
    await expectHttp(saveHint(h.db, users_.ownerC!, await campaign(huntC), { questionId: (await listQuestions(h.db, huntC))[0]!.id, title: "Nope", teaser: "", content: "nope!", unlock: cRule, withdrawalPolicy: "disable" }), 403);
    // Manual-review hint owned by A, and a partner hint that becomes free if B withdraws.
    hintManual = (await saveHint(h.db, users_.ownerA!, c, { questionId: q2, title: "Share feedback", teaser: "", content: "The map is at the harbor.", unlock: { kind: "activity", id: "feedback", ownerOrgId: orgs.A!.orgId, activity: { type: "manual_review", instructions: "Tell us one thing to improve in our docs." } }, withdrawalPolicy: "disable" })).id;
    hintFreeOnWithdraw = (await saveHint(h.db, users_.ownerA!, c, { questionId: q2, title: "Partner clue", teaser: "", content: "Look near the water.", unlock: { kind: "activity", id: "rhea-quiz", ownerOrgId: orgs.B!.orgId, offeringId: offeringB, activity: { type: "internal_quiz", campaignId: quizB } }, withdrawalPolicy: "free" })).id;
  });

  it("8: A publishes; hints are then locked", async () => {
    const check = await checkPublishable(h.db, await campaign(huntA));
    expect(check.problems).toEqual([]);
    await publishCampaign(h.db, users_.ownerA!, await campaign(huntA));
    await expectHttp(deleteHint(h.db, users_.ownerA!, await campaign(huntA), hint1), 409);
  });

  it("9–11: the player starts; Hint 2 is locked and its clue never leaves the server", async () => {
    await joinCampaign(h.db, users_.player!, huntA, null);
    const state = await getPlayState(h.db, users_.player!, huntA);
    if (!state.joined || !state.questions[0]) throw new Error("expected a question");
    const cards = state.questions[0].hints;
    expect(cards.map((x) => [x.title, x.status])).toEqual([["A free nudge", "AVAILABLE"], ["The Lending Secret", "LOCKED"]]);
    expect(cards[1]!.requirements[0]).toMatchObject({ provider: { orgName: "B Labs", spaceSlug: "b-labs" }, target: { campaignSlug: expect.any(String) }, status: "TODO" });
    expect(JSON.stringify(state)).not.toMatch(/powered by RHEA|Think about lending|harbor/);
    // Verifying before doing the activity fails honestly.
    const early = await verifyHintActivity(h.db, users_.player!, huntA, hint2, { leafId: "rhea-quiz" });
    expect(early.outcome).toMatchObject({ status: "failed", reason: "not_started" });
    expect(early.hints[1]!.status).toBe("FAILED");
  });

  it("free hints are revealed on request", async () => {
    const r = await revealHint(h.db, users_.player!, huntA, hint1);
    expect(r.hints[0]).toMatchObject({ status: "UNLOCKED", content: "Think about lending." });
    await expectHttp(revealHint(h.db, users_.player!, huntA, hint2), 409);
  });

  it("12–16: player completes B's challenge, NEAR District verifies it, Hint 2 unlocks", async () => {
    await finishHunt(users_.player!, quizB, ["tokens"]);
    const r = await verifyHintActivity(h.db, users_.player!, huntA, hint2, { leafId: "rhea-quiz" });
    expect(r.outcome).toMatchObject({ status: "verified", unlocked: true });
    expect(r.hints[1]).toMatchObject({ status: "UNLOCKED", content: "The vault is powered by RHEA." });
  });

  it("20: duplicate requests never create duplicate completions or unlocks", async () => {
    await Promise.all([1, 2, 3].map(() => verifyHintActivity(h.db, users_.player!, huntA, hint2, { leafId: "rhea-quiz" })));
    const comps = await h.db.select().from(activityCompletions).where(and(eq(activityCompletions.userId, users_.player!.userId), eq(activityCompletions.hintId, hint2)));
    const unlocks = await h.db.select().from(hintUnlocks).where(and(eq(hintUnlocks.userId, users_.player!.userId), eq(hintUnlocks.hintId, hint2)));
    expect(comps).toHaveLength(1);
    expect(unlocks).toHaveLength(1);
  });

  it("17: the player answers with the clue; the answer is saved, sealed, on the same entry", async () => {
    const r = await submitAnswer(h.db, users_.player!, huntA, q1, "RHEA", null);
    expect(r).toMatchObject({ saved: true, answered: 1 });
    const state = await getPlayState(h.db, users_.player!, huntA);
    expect(state.joined && state.questions.find((q) => q.id === q1)?.saved).toBe("RHEA");
    expect(state.joined && state.questions.find((q) => q.id === q2)?.saved).toBeNull();
  });

  it("manual review: owner's reviewers approve; players can't review themselves", async () => {
    const sub = await verifyHintActivity(h.db, users_.player!, huntA, hintManual, { leafId: "feedback", submission: { text: "Your docs need a search box." } });
    expect(sub.outcome.status).toBe("under_review");
    const again = await verifyHintActivity(h.db, users_.player!, huntA, hintManual, { leafId: "feedback", submission: { text: "Second submission spam" } });
    expect(again.outcome).toMatchObject({ status: "under_review", reason: "already_submitted" });
    const queue = await listReviews(h.db, orgs.A!.orgId);
    expect(queue).toHaveLength(1);
    await expectHttp(decideReview(h.db, users_.player!, queue[0]!.id, "approve", ""), 403);
    await expectHttp(decideReview(h.db, users_.ownerB!, queue[0]!.id, "approve", ""), 403);
    const ok = await decideReview(h.db, users_.ownerA!, queue[0]!.id, "approve", "Useful, thanks");
    expect(ok).toMatchObject({ status: "verified", unlocked: true });
    await expectHttp(decideReview(h.db, users_.ownerA!, queue[0]!.id, "reject", ""), 409);
  });

  it("18–19: finishing updates the existing campaign progress and qualification", async () => {
    const r = await submitAnswer(h.db, users_.player!, huntA, q2, "harbor", null);
    expect(r).toMatchObject({ saved: true, answered: 2, total: 2 });
    // score as if the deadline had passed, without ending the hunt the later tests still use
    await finalizeSealedHunt(h.db, huntA, new Date(Date.now() + 8 * 86_400_000));
    const [entry] = await h.db.select().from(participantEntries).where(and(eq(participantEntries.campaignId, huntA), eq(participantEntries.userId, users_.player!.userId)));
    expect(entry!.status).toBe("completed");
    const [q] = await h.db.select().from(qualifications).where(and(eq(qualifications.campaignId, huntA), eq(qualifications.userId, users_.player!.userId)));
    expect(["qualified", "held"]).toContain(q!.status);
  });

  it("partner withdrawal follows each hint's published policy, never silently", async () => {
    const [p] = await h.db.select().from(organizations).where(eq(organizations.id, orgs.A!.orgId));
    expect(p).toBeTruthy();
    const list = (await import("./partners")).listPartnerships;
    const partnership = (await list(h.db, orgs.B!.orgId))[0]!;
    await actOnPartnership(h.db, users_.ownerB!, orgs.B!.orgId, partnership.id, "cancel");
    await joinCampaign(h.db, users_.player2!, huntA, null);
    const cards1 = await hintCards(h.db, users_.player2!.userId, q1);
    expect(cards1[1]).toMatchObject({ status: "LOCKED", lockReason: "partner_withdrawn", content: null });
    await expectHttp(verifyHintActivity(h.db, users_.player2!, huntA, hint2, { leafId: "rhea-quiz" }), 409);
    const cards2 = await hintCards(h.db, users_.player2!.userId, q2);
    expect(cards2.find((x) => x.id === hintFreeOnWithdraw)).toMatchObject({ status: "AVAILABLE", free: true });
    // The earlier player's unlock is preserved.
    expect((await hintCards(h.db, users_.player!.userId, q1))[1]!.status).toBe("UNLOCKED");
  });
});

describe("on-chain hint evidence (engine rules with an injected chain port)", () => {
  let hunt: string;
  let hintSwap: string;
  let hintLend: string;
  const USDC = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
  let verdict: "verified" | "pending" = "pending";
  const deps: EngineDeps = {
    walletNetwork: "mainnet",
    onchain: {
      async verify(_def, input) {
        if (!input.wallets.includes("player3.near")) return { status: "failed", reason: "signer_not_verified_wallet" };
        if (verdict === "pending") return { status: "pending", reason: "not_final", retryAt: new Date(Date.now() - 1) };
        return { status: "verified", evidence: { provider: "near-rpc", txHash: input.txHash, receiptId: "r1", amount: "5000000", executedAt: new Date().toISOString() } };
      },
    },
  };

  it("sets up a hunt with a swap hint and a lending hint (each with a free path)", async () => {
    hunt = await mkHunt(users_.ownerA!, "A", "Onchain Trail", [["first", "one"]]);
    const c = await campaign(hunt);
    const q = (await listQuestions(h.db, hunt))[0]!.id;
    const quiz: RuleNode = { kind: "activity", id: "quiz", ownerOrgId: orgs.A!.orgId, activity: { type: "internal_campaign_completion", campaignId: (await h.db.select().from(campaigns).where(eq(campaigns.title, "The Lost Treasure")))[0]!.id } };
    hintSwap = (await saveHint(h.db, users_.ownerA!, c, { questionId: q, title: "Swap clue", teaser: "", content: "secret-1", unlock: { kind: "group", op: "ANY", children: [{ kind: "activity", id: "swap", ownerOrgId: orgs.A!.orgId, activity: { type: "near_rhea_swap", network: "mainnet", tokenIn: USDC } }, quiz] }, withdrawalPolicy: "disable" })).id;
    hintLend = (await saveHint(h.db, users_.ownerA!, c, { questionId: q, title: "Lend clue", teaser: "", content: "secret-2", unlock: { kind: "group", op: "ANY", children: [{ kind: "activity", id: "lend", ownerOrgId: orgs.A!.orgId, activity: { type: "near_rhea_lending_supply", network: "mainnet", tokenId: USDC, minAmount: "1000000" } }, quiz] }, withdrawalPolicy: "disable" })).id;
    expect((await checkPublishable(h.db, await campaign(hunt))).problems).toEqual([]);
    await publishCampaign(h.db, users_.ownerA!, await campaign(hunt));
    await joinCampaign(h.db, users_.player3!, hunt, null);
  });

  it("requires a verified mainnet wallet", async () => {
    const r = await requestVerification(h.db, deps, { userId: users_.player3!.userId, hintId: hintSwap, leafId: "swap", txHash: "Fdp7vhmYxNeG8hiif3XP9zGYuzxp3YTX9p9XWrhaKswf" });
    expect(r).toMatchObject({ status: "failed", reason: "no_verified_wallet" });
    await h.db.insert(walletConnections).values({ userId: users_.player3!.userId, network: "mainnet", accountId: "player3.near", publicKey: "ed25519:x", verifiedAt: new Date() });
  });

  it("stays pending until final, then verifies via the retry path", async () => {
    const tx = "8wXH3rW9i43VUMmiN9oH7bQ6wWNdD7oxC4iLs4hSoRP1";
    const r = await requestVerification(h.db, deps, { userId: users_.player3!.userId, hintId: hintSwap, leafId: "swap", txHash: tx });
    expect(r).toMatchObject({ status: "pending", reason: "not_final" });
    expect((await hintCards(h.db, users_.player3!.userId, (await listQuestions(h.db, hunt))[0]!.id))[0]!.status).toBe("PENDING_VERIFICATION");
    verdict = "verified";
    const { duePendingVerifications } = await import("@near-district/db");
    const due = await duePendingVerifications(h.db, new Date());
    expect(due).toHaveLength(1);
    expect(await processVerification(h.db, deps, due[0]!)).toMatchObject({ status: "verified", unlocked: true });
  });

  it("one transaction can't satisfy two requirements in the same hunt", async () => {
    const r = await requestVerification(h.db, deps, { userId: users_.player3!.userId, hintId: hintLend, leafId: "lend", txHash: "8wXH3rW9i43VUMmiN9oH7bQ6wWNdD7oxC4iLs4hSoRP1" });
    expect(r).toMatchObject({ status: "failed", reason: "evidence_reused" });
    const unlocked = await h.db.select().from(hintUnlocks).where(eq(hintUnlocks.hintId, hintLend));
    expect(unlocked).toHaveLength(0);
  });
});

describe("contract-call activity: player just presses Verify", () => {
  let hunt: string;
  let hintMint: string;
  let hintMint2: string;
  const seen: { txHash: string; exclude?: string[] }[] = [];
  // Simulates indexer discovery + RPC proof: the wallet has one qualifying tx (MINT) unless excluded.
  const MINT = "3xQmA1nTqk9Y3hV2fWm8b7cZ5dE4rT6yU8iO9pLkJhGf";
  const deps: EngineDeps = {
    walletNetwork: "mainnet",
    onchain: {
      async verify(def, input) {
        seen.push({ txHash: input.txHash, exclude: input.exclude });
        if (def.type !== "near_contract_call") return { status: "failed", reason: "unsupported_activity" };
        const hash = input.txHash || MINT;
        if ((input.exclude ?? []).includes(hash)) return { status: "failed", reason: "not_found" };
        return { status: "verified", evidence: { provider: "near-rpc", network: "mainnet", txHash: hash, receiptId: "r1", amount: "0", executedAt: new Date().toISOString() } };
      },
    },
  };
  const mint = (id: string, partner = false) => ({ kind: "activity" as const, id, ownerOrgId: orgs.A!.orgId, activity: { type: "near_contract_call" as const, network: "mainnet" as const, contractId: "nft.district.near", methodName: "nft_mint", title: "Mint the district badge", ...(partner ? { partner: { name: "Badge Labs", url: "https://badges.example" } } : {}) } });

  it("accepts contract-call hints; a partner link only on the second or third secret", async () => {
    hunt = await mkHunt(users_.ownerA!, "A", "Badge Trail", [["first", "one"], ["second", "two"]]);
    const c = await campaign(hunt);
    const [q1, q2] = (await listQuestions(h.db, hunt)).map((q) => q.id);
    await expectHttp(saveHint(h.db, users_.ownerA!, c, { questionId: q1!, title: "Hint", teaser: "", content: "look up", unlock: { kind: "group", op: "ANY", children: [mint("mint", true)] }, withdrawalPolicy: "disable" }), 400, /second or third secret/);
    hintMint = (await saveHint(h.db, users_.ownerA!, c, { questionId: q1!, title: "Hint", teaser: "", content: "look up", unlock: { kind: "group", op: "ANY", children: [mint("mint")] }, withdrawalPolicy: "disable" })).id;
    hintMint2 = (await saveHint(h.db, users_.ownerA!, c, { questionId: q2!, title: "Hint", teaser: "", content: "look down", unlock: { kind: "group", op: "ANY", children: [mint("mint2", true)] }, withdrawalPolicy: "disable" })).id;
    await publishCampaign(h.db, users_.ownerA!, await campaign(hunt));
    await joinCampaign(h.db, users_.player3!, hunt, null);
  });

  it("verifies without a transaction hash and unlocks the hint", async () => {
    const r = await requestVerification(h.db, deps, { userId: users_.player3!.userId, hintId: hintMint, leafId: "mint" });
    expect(r).toMatchObject({ status: "verified", unlocked: true });
    expect(seen.at(-1)!.txHash).toBe("");
  });

  it("verifying the same activity again is a no-op (no second verification)", async () => {
    const before = seen.length;
    const r = await requestVerification(h.db, deps, { userId: users_.player3!.userId, hintId: hintMint, leafId: "mint" });
    expect(r).toMatchObject({ status: "verified", unlocked: true });
    expect(seen.length).toBe(before);
  });

  it("an already-used transaction is excluded from discovery for the next hint", async () => {
    const r = await requestVerification(h.db, deps, { userId: users_.player3!.userId, hintId: hintMint2, leafId: "mint2" });
    expect(seen.at(-1)!.exclude).toContain(MINT);
    expect(r).toMatchObject({ status: "failed", reason: "not_found" });
  });
});

describe("shared expedition: end-to-end acceptance", () => {
  let chapter1: string;
  let chapter2: string;
  let finale: string;
  let expeditionId: string;

  it("1–3: A creates an expedition, B approves by contributing its own campaign", async () => {
    // Expedition participation is approved per expedition, independent of hint partnerships.
    chapter1 = await mkHunt(users_.ownerA!, "A", "Chapter One: The Docks", [["dock word", "anchor"]]);
    await publishCampaign(h.db, users_.ownerA!, await campaign(chapter1));
    chapter2 = await mkHunt(users_.ownerB!, "B", "Chapter Two: The Lighthouse", [["light word", "beam"]]);
    await publishCampaign(h.db, users_.ownerB!, await campaign(chapter2));
    finale = await mkHunt(users_.ownerA!, "A", "Finale: The Vault", [["vault word", "gold"]]);
    await publishCampaign(h.db, users_.ownerA!, await campaign(finale));

    const e = await createExpedition(h.db, users_.ownerA!, orgs.A!.orgId, { title: "The Grand Expedition", summary: "Two Spaces, one adventure." });
    expeditionId = e.id;
    await addOwnChapter(h.db, users_.ownerA!, orgs.A!.orgId, e.id, chapter1);
    await expectHttp(addOwnChapter(h.db, users_.ownerA!, orgs.A!.orgId, e.id, chapter2), 400, /own missions/);
    await inviteExpeditionPartner(h.db, users_.ownerA!, orgs.A!.orgId, e.id, "b-labs");
    await expectHttp(publishExpedition(h.db, users_.ownerA!, orgs.A!.orgId, e.id), 400, /two chapters/);
    await expectHttp(respondExpeditionInvite(h.db, users_.ownerB!, orgs.B!.orgId, e.id, "accept", chapter1), 400, /own missions/);
    await respondExpeditionInvite(h.db, users_.ownerB!, orgs.B!.orgId, e.id, "accept", chapter2);
    await addOwnChapter(h.db, users_.ownerA!, orgs.A!.orgId, e.id, finale);
    await setRewardChapter(h.db, users_.ownerA!, orgs.A!.orgId, e.id, finale);
    await publishExpedition(h.db, users_.ownerA!, orgs.A!.orgId, e.id);
    // Published expeditions are frozen.
    await expectHttp(addOwnChapter(h.db, users_.ownerA!, orgs.A!.orgId, e.id, await huntIdByAsync("Onchain Trail")), 409);
  });

  async function huntIdByAsync(title: string) {
    return (await h.db.select().from(campaigns).where(eq(campaigns.title, title)))[0]!.id;
  }

  it("4: the map receives a real route connecting the two Spaces", async () => {
    const [route] = await publicExpeditions(h.db, null);
    expect(route!.chapters.map((c) => c.spaceId)).toEqual([orgs.A!.spaceId, orgs.B!.spaceId, orgs.A!.spaceId]);
    expect(route!.chapters.map((c) => c.unlocked)).toEqual([true, false, false]);
  });

  it("5–8: chapters unlock in order and completion is recorded", async () => {
    const p = users_.player2!;
    await expectHttp(joinCampaign(h.db, p, finale, null), 403, /final chapter/);
    await finishHunt(p, chapter1, ["anchor"]);
    let [route] = await publicExpeditions(h.db, p.userId);
    expect(route!.chapters.map((c) => [c.completed, c.unlocked])).toEqual([[true, true], [false, true], [false, false]]);
    await finishHunt(p, chapter2, ["beam"]);
    [route] = await publicExpeditions(h.db, p.userId);
    expect(route!.completedAt).not.toBeNull();
    expect(route!.chapters[2]!.unlocked).toBe(true);
  });

  it("9: existing reward rules decide eligibility in the reward chapter", async () => {
    const p = users_.player2!;
    await finishHunt(p, finale, ["gold"]);
    await finalizeSealedHunt(h.db, finale, new Date(Date.now() + 8 * 86_400_000));
    const [q] = await h.db.select().from(qualifications).where(and(eq(qualifications.campaignId, finale), eq(qualifications.userId, p.userId)));
    expect(q).toBeTruthy();
    expect(await huntIdByAsync("Finale: The Vault")).toBe(finale);
  });
});
