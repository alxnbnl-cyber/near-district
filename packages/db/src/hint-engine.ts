/**
 * Hint unlock engine, shared by the web app (immediate "Verify" requests) and the worker
 * (retries of pending verifications). All eligibility is decided here, server-side.
 *
 *   verification request → verifier adapter → evidence → completion (idempotent, reuse-guarded)
 *   → rule evaluation → hint unlock (same transaction)
 *
 * Nothing here pays out. Unlocking a hint only reveals a clue.
 */
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { evaluateRule, leaves, type ActivityDef, type ActivityLeaf, type RuleNode } from "@yielvy/core";
import type { Db, Tx } from "./index";
import {
  activityCompletions,
  activityOfferings,
  activityVerifications,
  auditLogs,
  campaigns,
  creativeSubmissions,
  hintUnlocks,
  notifications,
  organizationMembers,
  organizationPartnerships,
  participantEntries,
  spaces,
  treasureHints,
  treasureQuestions,
  walletConnections,
} from "./schema";

export class HintEngineError extends Error {
  constructor(readonly status: number, message: string, readonly code: string) {
    super(message);
  }
}

/** Structural mirror of @yielvy/near's OnchainVerdict (injected so this package stays chain-agnostic). */
export type OnchainVerdict =
  | { status: "verified"; evidence: { txHash: string; receiptId: string; amount: string; executedAt: string; provider: string } & Record<string, unknown> }
  | { status: "pending"; reason: string; retryAt: Date }
  | { status: "failed"; reason: string };

export interface OnchainPort {
  verify(def: ActivityDef, input: { txHash: string; wallets: string[]; windowStart: Date; windowEnd: Date; now: Date }): Promise<OnchainVerdict>;
}

export interface EngineDeps {
  /** Network user wallets are verified on; an on-chain activity must target the same network. */
  walletNetwork: "mainnet" | "testnet";
  onchain: OnchainPort | null;
  now?: () => Date;
}

export const MAX_PENDING_ATTEMPTS = 60;
const ONCHAIN_TYPES = new Set(["near_rhea_swap", "near_rhea_lending_supply", "near_stake"]);

type HintRow = typeof treasureHints.$inferSelect;
type CampaignRow = typeof campaigns.$inferSelect;

export function hintRule(h: HintRow): RuleNode | null {
  return (h.unlock as RuleNode | null) ?? null;
}

export function findLeaf(h: HintRow, leafId: string): ActivityLeaf | undefined {
  const r = hintRule(h);
  return r ? leaves(r).find((l) => l.id === leafId) : undefined;
}

/** Org that owns the campaign a hint belongs to. */
async function campaignOrg(db: Db | Tx, campaignId: string): Promise<string> {
  const [r] = await db.select({ org: spaces.organizationId }).from(campaigns).innerJoin(spaces, eq(spaces.id, campaigns.spaceId)).where(eq(campaigns.id, campaignId)).limit(1);
  if (!r) throw new HintEngineError(404, "Campaign not found.", "not_found");
  return r.org;
}

export async function partnershipAccepted(db: Db | Tx, orgA: string, orgB: string): Promise<boolean> {
  if (orgA === orgB) return true;
  const rows = await db
    .select({ id: organizationPartnerships.id, a: organizationPartnerships.inviterOrgId, b: organizationPartnerships.inviteeOrgId })
    .from(organizationPartnerships)
    .where(eq(organizationPartnerships.status, "ACCEPTED"));
  return rows.some((r) => (r.a === orgA && r.b === orgB) || (r.a === orgB && r.b === orgA));
}

/**
 * Whether partner-provided requirements are still backed by an active offering and an accepted
 * partnership. If not, the hint's published withdrawal policy applies.
 */
export async function hintAvailability(db: Db | Tx, h: HintRow, now: Date): Promise<{ state: "open" | "not_yet" | "expired" | "partner_withdrawn"; freeByPolicy: boolean }> {
  if (h.availableFrom && now < h.availableFrom) return { state: "not_yet", freeByPolicy: false };
  if (h.availableUntil && now > h.availableUntil) return { state: "expired", freeByPolicy: false };
  const rule = hintRule(h);
  if (!rule) return { state: "open", freeByPolicy: false };
  const partnerLeaves = leaves(rule).filter((l) => l.offeringId);
  if (partnerLeaves.length === 0) return { state: "open", freeByPolicy: false };
  const org = await campaignOrg(db, h.campaignId);
  const offerIds = partnerLeaves.map((l) => l.offeringId!);
  const offers = await db.select({ id: activityOfferings.id, status: activityOfferings.status, org: activityOfferings.organizationId }).from(activityOfferings).where(inArray(activityOfferings.id, offerIds));
  for (const l of partnerLeaves) {
    const o = offers.find((x) => x.id === l.offeringId);
    if (!o || o.status !== "active" || o.org !== l.ownerOrgId || !(await partnershipAccepted(db, org, l.ownerOrgId))) {
      return { state: "partner_withdrawn", freeByPolicy: h.withdrawalPolicy === "free" };
    }
  }
  return { state: "open", freeByPolicy: false };
}

// ---------------------------------------------------------------------------- internal verifiers

type InternalResult = { ok: true; evidenceRef: string; evidence: Record<string, unknown>; at: Date } | { ok: false; reason: string };

async function liveTarget(db: Db | Tx, campaignId: string): Promise<CampaignRow | null> {
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  return c && c.currentVersion && c.moderation === "approved" ? c : null;
}

/** InternalCampaignVerifier / InternalQuizVerifier / question sequence / contest entry. */
export async function verifyInternal(db: Db | Tx, userId: string, a: ActivityDef): Promise<InternalResult> {
  if (a.type === "meteor_wallet_signin") {
    const [w] = await db
      .select({ id: walletConnections.id, at: walletConnections.verifiedAt, account: walletConnections.accountId })
      .from(walletConnections)
      .where(and(eq(walletConnections.userId, userId), eq(walletConnections.walletApp, "meteor-wallet")))
      .limit(1);
    if (!w) return { ok: false, reason: "no_meteor_wallet" };
    return { ok: true, evidenceRef: `wallet:${w.id}`, evidence: { walletApp: "meteor-wallet", accountId: w.account }, at: w.at };
  }
  if (!("campaignId" in a)) return { ok: false, reason: "not_internal" };
  const target = await liveTarget(db, a.campaignId);
  if (!target) return { ok: false, reason: "campaign_unavailable" };
  if (a.type === "internal_contest_entry" || (a.type === "internal_campaign_completion" && target.template === "creative_contest")) {
    const [s] = await db.select().from(creativeSubmissions).where(and(eq(creativeSubmissions.campaignId, target.id), eq(creativeSubmissions.userId, userId))).limit(1);
    if (!s || s.status === "withdrawn" || s.status === "rejected") return { ok: false, reason: "no_entry" };
    return { ok: true, evidenceRef: `submission:${s.id}`, evidence: { campaignId: target.id, submissionId: s.id }, at: s.createdAt };
  }
  const [e] = await db.select().from(participantEntries).where(and(eq(participantEntries.campaignId, target.id), eq(participantEntries.userId, userId))).limit(1);
  if (!e || e.status === "disqualified") return { ok: false, reason: "not_started" };
  if (a.type === "internal_question_sequence") {
    if (e.status !== "completed" && e.progress < a.questionCount) return { ok: false, reason: "sequence_incomplete" };
    return { ok: true, evidenceRef: `entry:${e.id}:q${a.questionCount}`, evidence: { campaignId: target.id, entryId: e.id, progress: e.progress }, at: new Date() };
  }
  // Sealed hunts only score at the deadline. For unlocking hints, answering every clue counts as finishing;
  // a minimum score can only be checked once the hunt has been scored.
  if (e.status === "completed" && e.completedAt) {
    if (a.type === "internal_quiz" && a.minScore && e.score < a.minScore) return { ok: false, reason: "score_below_minimum" };
    return { ok: true, evidenceRef: `entry:${e.id}`, evidence: { campaignId: target.id, entryId: e.id, score: e.score }, at: e.completedAt };
  }
  if (a.type === "internal_quiz" && a.minScore) return { ok: false, reason: "not_completed" };
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(treasureQuestions).where(eq(treasureQuestions.campaignId, target.id));
  if (n === 0 || e.progress < n) return { ok: false, reason: "not_completed" };
  return { ok: true, evidenceRef: `entry:${e.id}`, evidence: { campaignId: target.id, entryId: e.id, answered: e.progress }, at: new Date() };
}

// ---------------------------------------------------------------------------- completion + unlock

/** Inserts a completion idempotently and unlocks the hint if its rule is now satisfied. */
async function recordCompletion(
  tx: Tx,
  args: {
    userId: string;
    hint: HintRow;
    leafId: string;
    verificationId: string | null;
    provider: string;
    evidenceRef: string;
    exclusiveRef: string | null;
    evidence: Record<string, unknown>;
    amount: bigint | null;
    now: Date;
  },
): Promise<{ unlocked: boolean }> {
  const { userId, hint } = args;
  const inserted = await tx
    .insert(activityCompletions)
    .values({
      userId,
      campaignId: hint.campaignId,
      hintId: hint.id,
      leafId: args.leafId,
      verificationId: args.verificationId,
      provider: args.provider,
      evidenceRef: args.evidenceRef,
      exclusiveRef: args.exclusiveRef,
      evidence: args.evidence,
      verifiedAmount: args.amount,
      rulesHash: hint.rulesHash,
      verifiedAt: args.now,
    })
    .onConflictDoNothing()
    .returning({ id: activityCompletions.id });
  if (!inserted.length) {
    const [mine] = await tx
      .select({ id: activityCompletions.id })
      .from(activityCompletions)
      .where(and(eq(activityCompletions.userId, userId), eq(activityCompletions.hintId, hint.id), eq(activityCompletions.leafId, args.leafId)))
      .limit(1);
    if (!mine) throw new HintEngineError(409, "That transaction was already used for another requirement in this hunt.", "evidence_reused");
  }
  const done = await tx
    .select({ id: activityCompletions.id, leafId: activityCompletions.leafId })
    .from(activityCompletions)
    .where(and(eq(activityCompletions.userId, userId), eq(activityCompletions.hintId, hint.id)));
  const rule = hintRule(hint);
  if (!rule || !evaluateRule(rule, new Set(done.map((d) => d.leafId)))) return { unlocked: false };
  const unlocked = await tx
    .insert(hintUnlocks)
    .values({ userId, hintId: hint.id, rulesHash: hint.rulesHash, completionIds: done.map((d) => d.id) })
    .onConflictDoNothing()
    .returning({ hintId: hintUnlocks.hintId });
  if (unlocked.length) {
    await tx.insert(auditLogs).values({ actorUserId: userId, action: "hint.unlocked", targetType: "hint", targetId: hint.id, metadata: { campaignId: hint.campaignId, rulesHash: hint.rulesHash } });
    const [q] = await tx
      .select({ slug: campaigns.slug, title: campaigns.title, spaceSlug: spaces.slug })
      .from(campaigns)
      .innerJoin(spaces, eq(spaces.id, campaigns.spaceId))
      .where(eq(campaigns.id, hint.campaignId))
      .limit(1);
    await tx
      .insert(notifications)
      .values({
        userId,
        kind: "hint_unlocked",
        title: `Hint unlocked: ${hint.title}`,
        body: `Your clue for “${q?.title ?? "the hunt"}” is ready.`,
        link: q ? `/s/${q.spaceSlug}/c/${q.slug}` : null,
        dedupeKey: `hint:${hint.id}`,
      })
      .onConflictDoNothing();
  }
  return { unlocked: unlocked.length > 0 };
}

async function loadHint(db: Db | Tx, hintId: string): Promise<HintRow> {
  const [h] = await db.select().from(treasureHints).where(eq(treasureHints.id, hintId)).limit(1);
  if (!h) throw new HintEngineError(404, "Hint not found.", "not_found");
  return h;
}

export interface VerifyRequest {
  userId: string;
  hintId: string;
  leafId: string;
  txHash?: string;
  submission?: { text: string; link?: string };
}

export interface VerifyOutcome {
  status: "verified" | "pending" | "under_review" | "failed";
  reason: string | null;
  unlocked: boolean;
}

/** Time window for on-chain evidence: after the hunt opened, before it closed (and within the hint window). */
function evidenceWindow(c: CampaignRow, h: HintRow, now: Date) {
  const starts = [c.startsAt, c.publishedAt, h.availableFrom].filter((d): d is Date => Boolean(d));
  const ends = [now, c.endsAt, h.availableUntil].filter((d): d is Date => Boolean(d));
  return { windowStart: new Date(Math.max(...starts.map((d) => d.getTime()))), windowEnd: new Date(Math.min(...ends.map((d) => d.getTime()))) };
}

/**
 * Entry point for the "Verify activity" button. Callers must already have checked that the user is a
 * participant who has reached the hint's question and that the campaign is live.
 */
export async function requestVerification(db: Db, deps: EngineDeps, req: VerifyRequest): Promise<VerifyOutcome> {
  const now = deps.now?.() ?? new Date();
  const hint = await loadHint(db, req.hintId);
  const leaf = findLeaf(hint, req.leafId);
  if (!leaf) throw new HintEngineError(404, "That requirement isn't part of this hint.", "not_found");
  const avail = await hintAvailability(db, hint, now);
  if (avail.state !== "open") throw new HintEngineError(409, "This hint can't be unlocked right now.", `hint_${avail.state}`);

  const [already] = await db
    .select({ id: activityCompletions.id })
    .from(activityCompletions)
    .where(and(eq(activityCompletions.userId, req.userId), eq(activityCompletions.hintId, hint.id), eq(activityCompletions.leafId, leaf.id)))
    .limit(1);
  if (already) return { status: "verified", reason: null, unlocked: Boolean(await isUnlocked(db, req.userId, hint.id)) };

  const a = leaf.activity;
  const base = { userId: req.userId, campaignId: hint.campaignId, hintId: hint.id, leafId: leaf.id, activityType: a.type, ownerOrgId: leaf.ownerOrgId, rulesHash: hint.rulesHash };

  if (a.type === "manual_review") {
    const text = req.submission?.text?.trim() ?? "";
    if (text.length < 10 || text.length > 4000) throw new HintEngineError(400, "Describe your contribution in 10–4000 characters.", "bad_request");
    if (req.submission?.link && !/^https:\/\/[^\s]{3,500}$/.test(req.submission.link)) throw new HintEngineError(400, "Links must start with https://", "bad_request");
    if (a.requireLink && !req.submission?.link) throw new HintEngineError(400, "This activity needs a link to your work.", "bad_request");
    const [open] = await db
      .select({ id: activityVerifications.id })
      .from(activityVerifications)
      .where(and(eq(activityVerifications.userId, req.userId), eq(activityVerifications.hintId, hint.id), eq(activityVerifications.leafId, leaf.id), eq(activityVerifications.status, "under_review")))
      .limit(1);
    if (open) return { status: "under_review", reason: "already_submitted", unlocked: false };
    await db.insert(activityVerifications).values({ ...base, status: "under_review", input: { text, link: req.submission?.link ?? null } });
    return { status: "under_review", reason: null, unlocked: false };
  }

  if (ONCHAIN_TYPES.has(a.type)) {
    if (!req.txHash) throw new HintEngineError(400, "Paste the transaction hash of your activity.", "bad_request");
    const [dup] = await db
      .select({ id: activityVerifications.id, status: activityVerifications.status })
      .from(activityVerifications)
      .where(and(eq(activityVerifications.userId, req.userId), eq(activityVerifications.hintId, hint.id), eq(activityVerifications.leafId, leaf.id), eq(activityVerifications.status, "pending")))
      .limit(1);
    if (dup) return processVerification(db, deps, dup.id);
    const [row] = await db.insert(activityVerifications).values({ ...base, status: "pending", input: { txHash: req.txHash } }).returning({ id: activityVerifications.id });
    return processVerification(db, deps, row!.id);
  }

  // Internal activities: checked against our own tables.
  const r = await verifyInternal(db, req.userId, a);
  const [row] = await db
    .insert(activityVerifications)
    .values({ ...base, status: r.ok ? "verified" : "failed", reasonCode: r.ok ? null : r.reason, attempts: 1 })
    .returning({ id: activityVerifications.id });
  if (!r.ok) return { status: "failed", reason: r.reason, unlocked: false };
  const { unlocked } = await db.transaction((tx) =>
    recordCompletion(tx, { userId: req.userId, hint, leafId: leaf.id, verificationId: row!.id, provider: "yielvy-internal", evidenceRef: r.evidenceRef, exclusiveRef: null, evidence: r.evidence, amount: null, now }),
  );
  return { status: "verified", reason: null, unlocked };
}

async function isUnlocked(db: Db | Tx, userId: string, hintId: string) {
  const [u] = await db.select({ h: hintUnlocks.hintId }).from(hintUnlocks).where(and(eq(hintUnlocks.userId, userId), eq(hintUnlocks.hintId, hintId))).limit(1);
  return u;
}

/** Runs (or re-runs) a pending on-chain verification. Used by the web request and the worker. */
export async function processVerification(db: Db, deps: EngineDeps, verificationId: string): Promise<VerifyOutcome> {
  const now = deps.now?.() ?? new Date();
  const [v] = await db.select().from(activityVerifications).where(eq(activityVerifications.id, verificationId)).limit(1);
  if (!v) throw new HintEngineError(404, "Verification not found.", "not_found");
  if (v.status !== "pending") return { status: v.status, reason: v.reasonCode, unlocked: Boolean(await isUnlocked(db, v.userId, v.hintId)) };
  const hint = await loadHint(db, v.hintId);
  const leaf = findLeaf(hint, v.leafId);
  const fail = async (reason: string) => {
    await db.update(activityVerifications).set({ status: "failed", reasonCode: reason, attempts: v.attempts + 1, nextAttemptAt: null, updatedAt: now }).where(eq(activityVerifications.id, v.id));
    return { status: "failed" as const, reason, unlocked: false };
  };
  if (!leaf || !ONCHAIN_TYPES.has(leaf.activity.type)) return fail("requirement_changed");
  const actNet = (leaf.activity as { network?: string }).network ?? "mainnet";
  if (deps.walletNetwork !== actNet) return fail("network_mismatch");
  if (!deps.onchain) return fail("onchain_verifier_unavailable");
  const wallets = (await db.select({ a: walletConnections.accountId }).from(walletConnections).where(and(eq(walletConnections.userId, v.userId), eq(walletConnections.network, deps.walletNetwork)))).map((w) => w.a);
  if (!wallets.length) return fail("no_verified_wallet");
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, v.campaignId)).limit(1);
  if (!c) return fail("campaign_missing");
  const txHash = String((v.input as { txHash?: string }).txHash ?? "");

  let verdict: OnchainVerdict;
  try {
    verdict = await deps.onchain.verify(leaf.activity, { txHash, wallets, ...evidenceWindow(c, hint, now), now });
  } catch (e) {
    verdict = { status: "pending", reason: `verifier_error:${String((e as Error)?.message ?? e).slice(0, 80)}`, retryAt: new Date(now.getTime() + 120_000) };
  }
  if (verdict.status === "pending") {
    if (v.attempts + 1 >= MAX_PENDING_ATTEMPTS) return fail(`gave_up:${verdict.reason}`);
    await db
      .update(activityVerifications)
      .set({ reasonCode: verdict.reason, attempts: v.attempts + 1, nextAttemptAt: verdict.retryAt, updatedAt: now })
      .where(eq(activityVerifications.id, v.id));
    return { status: "pending", reason: verdict.reason, unlocked: false };
  }
  if (verdict.status === "failed") return fail(verdict.reason);

  const ev = verdict.evidence;
  try {
    const { unlocked } = await db.transaction(async (tx) => {
      const r = await recordCompletion(tx, {
        userId: v.userId,
        hint,
        leafId: leaf.id,
        verificationId: v.id,
        provider: ev.provider,
        evidenceRef: `near:${ev.network}:${ev.txHash}:${ev.receiptId}`,
        exclusiveRef: `near:${ev.network}:${ev.txHash}`,
        evidence: ev,
        amount: BigInt(ev.amount),
        now,
      });
      await tx.update(activityVerifications).set({ status: "verified", reasonCode: null, attempts: v.attempts + 1, nextAttemptAt: null, updatedAt: now }).where(eq(activityVerifications.id, v.id));
      return r;
    });
    return { status: "verified", reason: null, unlocked };
  } catch (e) {
    if (e instanceof HintEngineError && e.code === "evidence_reused") return fail("evidence_reused");
    throw e;
  }
}

/** Opens a free hint (no rule, or made free by its partner-withdrawal policy). Idempotent. */
export async function revealFreeHint(db: Db, userId: string, hintId: string, now = new Date()): Promise<void> {
  const hint = await loadHint(db, hintId);
  const avail = await hintAvailability(db, hint, now);
  const free = hintRule(hint) === null ? avail.state === "open" : avail.freeByPolicy;
  if (!free) throw new HintEngineError(409, "This hint needs an activity first.", "hint_locked");
  const res = await db.insert(hintUnlocks).values({ userId, hintId, rulesHash: hint.rulesHash, completionIds: [] }).onConflictDoNothing().returning({ h: hintUnlocks.hintId });
  if (res.length) await db.insert(auditLogs).values({ actorUserId: userId, action: "hint.revealed", targetType: "hint", targetId: hintId, metadata: { campaignId: hint.campaignId, free: true } });
}

/** Due pending verifications, oldest first (worker). */
export async function duePendingVerifications(db: Db, now: Date, limit = 20): Promise<string[]> {
  const rows = await db
    .select({ id: activityVerifications.id, next: activityVerifications.nextAttemptAt })
    .from(activityVerifications)
    .where(eq(activityVerifications.status, "pending"))
    .orderBy(activityVerifications.nextAttemptAt)
    .limit(limit * 3);
  return rows.filter((r) => !r.next || r.next <= now).slice(0, limit).map((r) => r.id);
}

/** Manual review by the activity owner's team. Reviewers can never approve their own submission. */
export async function reviewVerification(db: Db, reviewerUserId: string, verificationId: string, decision: "approve" | "reject", note: string, now = new Date()): Promise<VerifyOutcome> {
  const [v] = await db.select().from(activityVerifications).where(eq(activityVerifications.id, verificationId)).limit(1);
  if (!v) throw new HintEngineError(404, "Submission not found.", "not_found");
  const [m] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, v.ownerOrgId), eq(organizationMembers.userId, reviewerUserId)))
    .limit(1);
  if (!m) throw new HintEngineError(403, "Only the activity owner's team can review this.", "forbidden");
  if (v.userId === reviewerUserId) throw new HintEngineError(403, "You can't review your own submission.", "forbidden");
  if (v.status !== "under_review") throw new HintEngineError(409, "This submission was already reviewed.", "conflict");
  if (decision === "reject") {
    await db.update(activityVerifications).set({ status: "failed", reasonCode: "rejected_by_reviewer", reviewedBy: reviewerUserId, reviewNote: note, updatedAt: now }).where(eq(activityVerifications.id, v.id));
    await db.insert(auditLogs).values({ actorUserId: reviewerUserId, action: "activity.review_rejected", targetType: "activity_verification", targetId: v.id, metadata: { hintId: v.hintId } });
    return { status: "failed", reason: "rejected_by_reviewer", unlocked: false };
  }
  const hint = await loadHint(db, v.hintId);
  const { unlocked } = await db.transaction(async (tx) => {
    const res = await tx
      .update(activityVerifications)
      .set({ status: "verified", reviewedBy: reviewerUserId, reviewNote: note, updatedAt: now })
      .where(and(eq(activityVerifications.id, v.id), eq(activityVerifications.status, "under_review")))
      .returning({ id: activityVerifications.id });
    if (!res.length) throw new HintEngineError(409, "This submission was already reviewed.", "conflict");
    await tx.insert(auditLogs).values({ actorUserId: reviewerUserId, action: "activity.review_approved", targetType: "activity_verification", targetId: v.id, metadata: { hintId: v.hintId } });
    return recordCompletion(tx, {
      userId: v.userId,
      hint,
      leafId: v.leafId,
      verificationId: v.id,
      provider: "manual-review",
      evidenceRef: `review:${v.id}`,
      exclusiveRef: null,
      evidence: { reviewer: reviewerUserId, note },
      amount: null,
      now,
    });
  });
  return { status: "verified", reason: null, unlocked };
}

/** Latest verification per requirement + completions + unlock for one user and a set of hints. */
export async function hintProgress(db: Db | Tx, userId: string, hintIds: string[]) {
  if (!hintIds.length) return { completions: [], verifications: [], unlocks: [] };
  const [completions, verifications, unlocks] = await Promise.all([
    db.select({ hintId: activityCompletions.hintId, leafId: activityCompletions.leafId }).from(activityCompletions).where(and(eq(activityCompletions.userId, userId), inArray(activityCompletions.hintId, hintIds))),
    db
      .select({ hintId: activityVerifications.hintId, leafId: activityVerifications.leafId, status: activityVerifications.status, reasonCode: activityVerifications.reasonCode, reviewNote: activityVerifications.reviewNote, createdAt: activityVerifications.createdAt })
      .from(activityVerifications)
      .where(and(eq(activityVerifications.userId, userId), inArray(activityVerifications.hintId, hintIds)))
      .orderBy(desc(activityVerifications.createdAt)),
    db.select({ hintId: hintUnlocks.hintId }).from(hintUnlocks).where(and(eq(hintUnlocks.userId, userId), inArray(hintUnlocks.hintId, hintIds))),
  ]);
  return { completions, verifications, unlocks };
}

/** Question position for a hint (players may only work on hints up to their current question). */
export async function hintQuestionPosition(db: Db | Tx, hintId: string): Promise<{ position: number; campaignId: string } | null> {
  const [r] = await db
    .select({ position: treasureQuestions.position, campaignId: treasureHints.campaignId })
    .from(treasureHints)
    .innerJoin(treasureQuestions, eq(treasureQuestions.id, treasureHints.questionId))
    .where(eq(treasureHints.id, hintId))
    .limit(1);
  return r ?? null;
}
