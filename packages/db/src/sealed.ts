import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "./index";
import { campaigns, participantEntries, qualifications, sealedAnswers, treasureQuestions } from "./schema";

/** Points per correct clue: 100 × difficulty (sealed hunts have no wrong-attempt penalty: attempts are hidden). */
export const sealedPoints = (difficulty: number) => 100 * difficulty;

/**
 * Scores a sealed treasure hunt once it has ended. Players who answered every clue correctly qualify; everyone
 * gets their score. Idempotent: safe to run from the worker tick and lazily from the web app.
 */
export async function finalizeSealedHunt(db: Db, campaignId: string, now = new Date()): Promise<{ scored: number; qualified: number }> {
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!c || c.template !== "treasure_hunt" || !c.endsAt || c.endsAt > now) return { scored: 0, qualified: 0 };
  const questions = await db.select({ id: treasureQuestions.id, difficulty: treasureQuestions.difficulty }).from(treasureQuestions).where(eq(treasureQuestions.campaignId, c.id));
  if (!questions.length) return { scored: 0, qualified: 0 };
  const entries = await db.select().from(participantEntries).where(and(eq(participantEntries.campaignId, c.id), eq(participantEntries.status, "in_progress")));
  if (!entries.length) return { scored: 0, qualified: 0 };
  const answers = await db
    .select({ entryId: sealedAnswers.entryId, questionId: sealedAnswers.questionId, correct: sealedAnswers.correct, updatedAt: sealedAnswers.updatedAt })
    .from(sealedAnswers)
    .where(inArray(sealedAnswers.entryId, entries.map((e) => e.id)));
  const diff = new Map(questions.map((q) => [q.id, q.difficulty]));
  let qualified = 0;
  for (const e of entries) {
    const mine = answers.filter((a) => a.entryId === e.id);
    const correct = mine.filter((a) => a.correct);
    const score = correct.reduce((s, a) => s + sealedPoints(diff.get(a.questionId) ?? 1), 0);
    const perfect = correct.length === questions.length;
    const lastSaved = mine.reduce<Date | null>((m, a) => (!m || a.updatedAt > m ? a.updatedAt : m), null);
    await db.transaction(async (tx) => {
      await tx
        .update(participantEntries)
        .set({ score, progress: mine.length, ...(perfect ? { status: "completed" as const, completedAt: lastSaved ?? now } : {}) })
        .where(and(eq(participantEntries.id, e.id), eq(participantEntries.status, "in_progress")));
      if (perfect) {
        await tx.insert(qualifications).values({ campaignId: c.id, userId: e.userId, score, status: "qualified", qualifiedAt: now }).onConflictDoNothing();
      }
    });
    if (perfect) qualified++;
  }
  return { scored: entries.length, qualified };
}
