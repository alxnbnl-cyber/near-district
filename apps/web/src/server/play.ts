import "server-only";
import { and, campaigns, count, eq, finalizeSealedHunt, organizationMembers, participantEntries, qualifications, questionAttempts, sealedAnswers, spaces, sql, treasureAnswerRules, treasureQuestions, type Db } from "@yielvy/db";
import { answerDigest, checkAnswer, normalizeText, DEFAULT_TEXT_NORMALIZATION, type AnswerRule, type CampaignRules } from "@yielvy/core";
import { decryptJson, encryptJson } from "./crypto";
import { env } from "./env";
import { audit } from "./audit";
import { badRequest, conflict, forbidden, HttpError, notFound } from "./http";
import { rateLimit } from "./rate-limit";
import { currentRules, effectiveStatus } from "./campaigns";
import type { SessionUser } from "./session";
import { hintCards, type HintCardView } from "./hints";
import { assertExpeditionGate } from "./expeditions";

/** Organizer team members may never take part in (or win) their own Space's campaigns. */
export async function assertNotOrganizer(db: Db, userId: string, spaceId: string) {
  const [m] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(spaces, eq(spaces.organizationId, organizationMembers.organizationId))
    .where(and(eq(spaces.id, spaceId), eq(organizationMembers.userId, userId)))
    .limit(1);
  if (m) throw forbidden("Organizer team members can't take part in their own campaigns. Use Preview in the editor instead.");
}

/** Points per question: 100 × difficulty, minus 10 per wrong attempt, floored at 10 × difficulty. */
export function questionPoints(difficulty: number, wrongAttempts: number): number {
  return Math.max(10 * difficulty, 100 * difficulty - 10 * wrongAttempts);
}

/** Completing faster than this per question is held for manual review (possible scripting/shared answers). */
const MIN_SECONDS_PER_QUESTION = 4;

async function loadLive(db: Db, campaignId: string) {
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!c || c.moderation !== "approved" || !c.currentVersion) throw notFound("Campaign not found.");
  const status = effectiveStatus(c as never);
  return { c, status };
}

export async function joinCampaign(db: Db, user: SessionUser, campaignId: string, country: string | null) {
  const { c, status } = await loadLive(db, campaignId);
  if (status !== "LIVE") throw conflict(status === "SCHEDULED" ? "This campaign hasn't started yet." : "This campaign isn't open right now.");
  const rules = (await currentRules(db, c)) as CampaignRules;
  if (country && rules.eligibility.blockedJurisdictions.includes(country.toUpperCase())) {
    throw forbidden("This campaign isn't available in your region.");
  }
  await assertNotOrganizer(db, user.userId, c.spaceId);
  await assertExpeditionGate(db, user.userId, c.id);
  if (rules.fundingSource !== "none" && rules.eligibility.requireVerifiedPayout && !user.payoutAccountId) {
    throw new HttpError(403, "Link a NEAR wallet you control first — that's where any reward would be sent.", "wallet_required");
  }
  await rateLimit(db, `join:${user.userId}`, 20, 3600);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(participantEntries).where(and(eq(participantEntries.campaignId, c.id), eq(participantEntries.userId, user.userId))).limit(1);
    if (existing) return existing;
    if (rules.eligibility.maxParticipants) {
      const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(participantEntries).where(eq(participantEntries.campaignId, c.id));
      if (n >= rules.eligibility.maxParticipants) throw conflict("This campaign is full.");
    }
    const [row] = await tx
      .insert(participantEntries)
      .values({ campaignId: c.id, userId: user.userId, rulesVersion: c.currentVersion! })
      .onConflictDoNothing()
      .returning();
    return row ?? (await tx.select().from(participantEntries).where(and(eq(participantEntries.campaignId, c.id), eq(participantEntries.userId, user.userId))))[0]!;
  });
}

export interface PublicQuestion {
  id: string;
  index: number;
  type: "short_text" | "multiple_choice" | "numeric";
  prompt: string;
  clue: string | null;
  options: { id: string; label: string }[] | null;
  imageUrl: string | null;
  referenceUrl: string | null;
  difficulty: number;
  /** The player's saved answer (sealed until the end), or null. */
  saved: string | null;
  savedAt: string | null;
  /** Only after the mission ends. */
  result: { correct: boolean; reveal: string | null } | null;
  /** Optional hints; locked content is never included. */
  hints: HintCardView[];
}

/** Once a mission's deadline passes, sealed answers are scored and revealed. */
function isClosed(c: { endsAt: Date | null }, status: string) {
  return (c.endsAt !== null && c.endsAt <= new Date()) || ["ENDED", "AWAITING_RESULTS", "COMPLETED"].includes(status);
}

export async function getPlayState(db: Db, user: SessionUser, campaignId: string) {
  const { c, status } = await loadLive(db, campaignId);
  const closed = isClosed(c, status);
  if (closed) await finalizeSealedHunt(db, c.id);
  const [entry] = await db.select().from(participantEntries).where(and(eq(participantEntries.campaignId, c.id), eq(participantEntries.userId, user.userId))).limit(1);
  const questions = await db.select().from(treasureQuestions).where(eq(treasureQuestions.campaignId, c.id)).orderBy(treasureQuestions.position);
  const timeline = { startsAt: c.startsAt?.toISOString() ?? null, endsAt: c.endsAt?.toISOString() ?? null, closed };
  if (!entry) return { status, joined: false as const, total: questions.length, timeline };
  const saved = await db.select().from(sealedAnswers).where(eq(sealedAnswers.entryId, entry.id));
  const byQ = new Map(saved.map((r) => [r.questionId, r]));
  const list: PublicQuestion[] = [];
  for (const [i, q] of questions.entries()) {
    const r = byQ.get(q.id);
    list.push({
      id: q.id,
      index: i,
      type: q.type,
      prompt: q.prompt,
      clue: q.clue,
      options: q.options ?? null,
      imageUrl: q.imageUploadId ? `/api/uploads/${q.imageUploadId}` : null,
      referenceUrl: q.referenceUrl,
      difficulty: q.difficulty,
      saved: r ? decryptJson<{ a: string }>(r.answerCipher).a : null,
      savedAt: r ? r.updatedAt.toISOString() : null,
      result: closed ? { correct: Boolean(r?.correct), reveal: q.revealText ?? null } : null,
      hints: closed ? [] : await hintCards(db, user.userId, q.id),
    });
  }
  const [qual] = closed ? await db.select({ status: qualifications.status }).from(qualifications).where(and(eq(qualifications.campaignId, c.id), eq(qualifications.userId, user.userId))).limit(1) : [];
  return {
    status,
    joined: true as const,
    total: questions.length,
    answered: saved.length,
    timeline,
    entryStatus: entry.status,
    score: closed ? entry.score : null,
    correctCount: closed ? saved.filter((r) => r.correct).length : null,
    qualification: closed ? (qual?.status ?? "not_qualified") : null,
    questions: list,
  };
}

export interface SaveResult {
  saved: true;
  answered: number;
  total: number;
  savedAt: string;
}

/**
 * Saves (or replaces) the player's answer for one clue. Correctness is computed now but never returned:
 * answers stay sealed until the deadline, so feedback can't be used to brute-force or share answers.
 */
export async function submitAnswer(db: Db, user: SessionUser, campaignId: string, questionId: string, answer: string, ipHash: string | null): Promise<SaveResult> {
  if (typeof answer !== "string" || answer.trim().length === 0) throw badRequest("Type an answer first.");
  if (answer.length > 500) throw badRequest("That answer is too long.");
  // Layered throttles: per user overall, per user+question, per IP.
  await rateLimit(db, `answer:u:${user.userId}`, 60, 60);
  await rateLimit(db, `answer:q:${user.userId}:${questionId}`, 20, 60);
  if (ipHash) await rateLimit(db, `answer:ip:${ipHash}`, 240, 60);

  const { c, status } = await loadLive(db, campaignId);
  if (status !== "LIVE" || isClosed(c, status)) throw conflict("Answers are locked: this mission has ended.");
  const pepper = env().ANSWER_PEPPER;

  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select()
      .from(participantEntries)
      .where(and(eq(participantEntries.campaignId, c.id), eq(participantEntries.userId, user.userId)))
      .for("update")
      .limit(1);
    if (!entry) throw badRequest("Start the mission first.");
    if (entry.status !== "in_progress") throw conflict("This mission is already scored.");
    const [q] = await tx.select().from(treasureQuestions).where(and(eq(treasureQuestions.id, questionId), eq(treasureQuestions.campaignId, c.id))).limit(1);
    if (!q) throw notFound("Secret not found.");
    if (q.type === "multiple_choice" && !(q.options ?? []).some((o) => o.id === answer)) throw badRequest("Pick one of the options.");

    const [ruleRow] = await tx.select().from(treasureAnswerRules).where(eq(treasureAnswerRules.questionId, q.id)).limit(1);
    if (!ruleRow) throw new HttpError(500, "Question is misconfigured.");
    const rule = decryptJson<AnswerRule>(ruleRow.ciphertext);
    const correct = checkAnswer(rule, answer, pepper, ruleRow.salt);
    const digest = answerDigest(pepper, `attempt:${q.id}`, normalizeText(answer, DEFAULT_TEXT_NORMALIZATION));
    const now = new Date();
    await tx
      .insert(sealedAnswers)
      .values({ entryId: entry.id, questionId: q.id, answerCipher: encryptJson({ a: answer.trim() }), correct, submissionDigest: digest })
      .onConflictDoUpdate({
        target: [sealedAnswers.entryId, sealedAnswers.questionId],
        set: { answerCipher: encryptJson({ a: answer.trim() }), correct, submissionDigest: digest, updatedAt: now, edits: sql`${sealedAnswers.edits} + 1` },
      });
    // keep an audit trail of every save (also feeds shared-answer detection); never exposed to players
    await tx.insert(questionAttempts).values({ entryId: entry.id, questionId: q.id, correct, submissionDigest: digest, ipHash });
    const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(sealedAnswers).where(eq(sealedAnswers.entryId, entry.id));
    const total = (await tx.select({ id: treasureQuestions.id }).from(treasureQuestions).where(eq(treasureQuestions.campaignId, c.id))).length;
    await tx.update(participantEntries).set({ progress: n }).where(eq(participantEntries.id, entry.id));
    return { saved: true as const, answered: n, total, savedAt: now.toISOString() };
  });
}
