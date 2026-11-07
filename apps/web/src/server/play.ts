import "server-only";
import { and, campaigns, count, desc, eq, organizationMembers, participantEntries, qualifications, questionAttempts, spaces, treasureAnswerRules, treasureQuestions, type Db } from "@yielvy/db";
import { answerDigest, checkAnswer, normalizeText, DEFAULT_TEXT_NORMALIZATION, type AnswerRule, type CampaignRules } from "@yielvy/core";
import { decryptJson } from "./crypto";
import { env } from "./env";
import { audit } from "./audit";
import { badRequest, conflict, forbidden, HttpError, notFound } from "./http";
import { rateLimit } from "./rate-limit";
import { currentRules, effectiveStatus } from "./campaigns";
import type { SessionUser } from "./session";

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
  maxAttempts: number;
  attemptsUsed: number;
  cooldownUntil: string | null;
}

export async function getPlayState(db: Db, user: SessionUser, campaignId: string) {
  const { c, status } = await loadLive(db, campaignId);
  const [entry] = await db.select().from(participantEntries).where(and(eq(participantEntries.campaignId, c.id), eq(participantEntries.userId, user.userId))).limit(1);
  const questions = await db.select().from(treasureQuestions).where(eq(treasureQuestions.campaignId, c.id)).orderBy(treasureQuestions.position);
  if (!entry) return { status, joined: false as const, total: questions.length };
  let current: PublicQuestion | null = null;
  if (entry.status === "in_progress" && entry.progress < questions.length) {
    const q = questions[entry.progress]!;
    const attempts = await db
      .select({ correct: questionAttempts.correct, createdAt: questionAttempts.createdAt })
      .from(questionAttempts)
      .where(and(eq(questionAttempts.entryId, entry.id), eq(questionAttempts.questionId, q.id)))
      .orderBy(desc(questionAttempts.createdAt));
    const last = attempts[0];
    const cooldownUntil = last && !last.correct && q.cooldownSeconds > 0 ? new Date(last.createdAt.getTime() + q.cooldownSeconds * 1000) : null;
    current = {
      id: q.id,
      index: entry.progress,
      type: q.type,
      prompt: q.prompt,
      clue: q.clue,
      options: q.options ?? null,
      imageUrl: q.imageUploadId ? `/api/uploads/${q.imageUploadId}` : null,
      referenceUrl: q.referenceUrl,
      difficulty: q.difficulty,
      maxAttempts: q.maxAttempts,
      attemptsUsed: attempts.length,
      cooldownUntil: cooldownUntil && cooldownUntil > new Date() ? cooldownUntil.toISOString() : null,
    };
  }
  return {
    status,
    joined: true as const,
    total: questions.length,
    progress: entry.progress,
    entryStatus: entry.status,
    score: entry.score,
    completedAt: entry.completedAt?.toISOString() ?? null,
    question: current,
  };
}

export interface AnswerResult {
  correct: boolean;
  completed: boolean;
  attemptsLeft: number;
  cooldownUntil: string | null;
  qualification: "qualified" | "held" | null;
}

export async function submitAnswer(db: Db, user: SessionUser, campaignId: string, questionId: string, answer: string, ipHash: string | null): Promise<AnswerResult> {
  if (typeof answer !== "string" || answer.trim().length === 0) throw badRequest("Type an answer first.");
  if (answer.length > 500) throw badRequest("That answer is too long.");
  // Layered throttles: per user overall, per user+question, per IP.
  await rateLimit(db, `answer:u:${user.userId}`, 60, 60);
  await rateLimit(db, `answer:q:${user.userId}:${questionId}`, 12, 60);
  if (ipHash) await rateLimit(db, `answer:ip:${ipHash}`, 240, 60);

  const { c, status } = await loadLive(db, campaignId);
  if (status !== "LIVE") throw conflict("This campaign isn't accepting answers right now.");
  const pepper = env().ANSWER_PEPPER;

  return db.transaction(async (tx) => {
    // Row lock serializes concurrent submissions from the same participant.
    const [entry] = await tx
      .select()
      .from(participantEntries)
      .where(and(eq(participantEntries.campaignId, c.id), eq(participantEntries.userId, user.userId)))
      .for("update")
      .limit(1);
    if (!entry) throw badRequest("Start the hunt first.");
    if (entry.status !== "in_progress") throw conflict("You've already finished this hunt.");
    const questions = await tx.select().from(treasureQuestions).where(eq(treasureQuestions.campaignId, c.id)).orderBy(treasureQuestions.position);
    const q = questions[entry.progress];
    if (!q) throw conflict("No question is waiting for you.");
    if (q.id !== questionId) throw conflict("That isn't your current question. Refresh to continue.", "stale_question");

    const attempts = await tx
      .select({ correct: questionAttempts.correct, createdAt: questionAttempts.createdAt })
      .from(questionAttempts)
      .where(and(eq(questionAttempts.entryId, entry.id), eq(questionAttempts.questionId, q.id)))
      .orderBy(desc(questionAttempts.createdAt));
    if (attempts.length >= q.maxAttempts) throw conflict("You've used every attempt for this question.", "out_of_attempts");
    const last = attempts[0];
    if (last && !last.correct && q.cooldownSeconds > 0) {
      const until = new Date(last.createdAt.getTime() + q.cooldownSeconds * 1000);
      if (until > new Date()) throw new HttpError(429, "Take a breath — you can try again shortly.", "cooldown");
    }

    const [ruleRow] = await tx.select().from(treasureAnswerRules).where(eq(treasureAnswerRules.questionId, q.id)).limit(1);
    if (!ruleRow) throw new HttpError(500, "Question is misconfigured.");
    const rule = decryptJson<AnswerRule>(ruleRow.ciphertext);
    const correct = checkAnswer(rule, answer, pepper, ruleRow.salt);
    await tx.insert(questionAttempts).values({
      entryId: entry.id,
      questionId: q.id,
      correct,
      submissionDigest: answerDigest(pepper, `attempt:${q.id}`, normalizeText(answer, DEFAULT_TEXT_NORMALIZATION)),
      ipHash,
    });

    const attemptsLeft = q.maxAttempts - attempts.length - 1;
    if (!correct) {
      return {
        correct: false,
        completed: false,
        attemptsLeft,
        cooldownUntil: q.cooldownSeconds > 0 ? new Date(Date.now() + q.cooldownSeconds * 1000).toISOString() : null,
        qualification: null,
      };
    }
    const progress = entry.progress + 1;
    const score = entry.score + questionPoints(q.difficulty, attempts.length);
    const completed = progress >= questions.length;
    await tx
      .update(participantEntries)
      .set({ progress, score, ...(completed ? { status: "completed" as const, completedAt: new Date() } : {}) })
      .where(eq(participantEntries.id, entry.id));
    let qualification: AnswerResult["qualification"] = null;
    if (completed) {
      const seconds = (Date.now() - entry.startedAt.getTime()) / 1000;
      const suspicious = seconds < MIN_SECONDS_PER_QUESTION * questions.length;
      qualification = suspicious ? "held" : "qualified";
      await tx
        .insert(qualifications)
        .values({
          campaignId: c.id,
          userId: user.userId,
          score,
          status: qualification,
          holdReason: suspicious ? `Completed ${questions.length} questions in ${Math.round(seconds)}s` : null,
          qualifiedAt: new Date(),
        })
        .onConflictDoNothing();
      await audit(tx, { actorUserId: user.userId, action: "hunt.completed", targetType: "campaign", targetId: c.id, metadata: { score, seconds: Math.round(seconds), qualification } });
    }
    return { correct: true, completed, attemptsLeft, cooldownUntil: null, qualification };
  });
}
