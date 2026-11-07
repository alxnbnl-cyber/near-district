import "server-only";
import { and, campaigns, creativeSubmissions, desc, eq, inArray, submissionReviews, users, type Db } from "@yielvy/db";
import { weightedScore, type CampaignRules } from "@yielvy/core";
import { audit } from "./audit";
import { badRequest, conflict, forbidden, HttpError, notFound } from "./http";
import { rateLimit } from "./rate-limit";
import { currentRules, effectiveStatus } from "./campaigns";
import { assertNotOrganizer } from "./play";
import type { SessionUser } from "./session";

export async function submitEntry(
  db: Db,
  user: SessionUser,
  campaignId: string,
  input: { title: string; body: string; externalUrl?: string; imageUploadId?: string | null },
  country: string | null,
) {
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!c || c.template !== "creative_contest" || !c.currentVersion || c.moderation !== "approved") throw notFound("Contest not found.");
  if (effectiveStatus(c as never) !== "LIVE") throw conflict("This contest isn't accepting entries right now.");
  const rules = (await currentRules(db, c)) as CampaignRules;
  if (country && rules.eligibility.blockedJurisdictions.includes(country.toUpperCase())) throw forbidden("This contest isn't available in your region.");
  if (rules.fundingSource !== "none" && rules.eligibility.requireVerifiedPayout && !user.payoutAccountId) {
    throw new HttpError(403, "Link a NEAR wallet you control first — that's where any reward would be sent.", "wallet_required");
  }
  await assertNotOrganizer(db, user.userId, c.spaceId);
  await rateLimit(db, `submit:${user.userId}`, 5, 3600);
  try {
    const [row] = await db
      .insert(creativeSubmissions)
      .values({
        campaignId: c.id,
        userId: user.userId,
        title: input.title,
        body: input.body,
        externalUrl: input.externalUrl ?? null,
        imageUploadId: input.imageUploadId ?? null,
        rulesVersion: c.currentVersion,
      })
      .returning();
    await audit(db, { actorUserId: user.userId, action: "contest.submitted", targetType: "submission", targetId: row!.id, metadata: { campaignId: c.id } });
    return row!;
  } catch (e) {
    if (String((e as { cause?: { code?: string } }).cause?.code) === "23505") throw conflict("You've already entered this contest.");
    throw e;
  }
}

export async function listSubmissions(db: Db, campaignId: string, status?: string) {
  const rows = await db
    .select({ s: creativeSubmissions, author: users.displayName })
    .from(creativeSubmissions)
    .innerJoin(users, eq(users.id, creativeSubmissions.userId))
    .where(status ? and(eq(creativeSubmissions.campaignId, campaignId), eq(creativeSubmissions.status, status as "submitted")) : eq(creativeSubmissions.campaignId, campaignId))
    .orderBy(desc(creativeSubmissions.createdAt));
  const ids = rows.map((r) => r.s.id);
  const reviews = ids.length ? await db.select().from(submissionReviews).where(inArray(submissionReviews.submissionId, ids)).orderBy(desc(submissionReviews.createdAt)) : [];
  return rows.map((r) => {
    const mine = reviews.filter((x) => x.submissionId === r.s.id);
    // latest review per reviewer is current
    const latest = new Map<string, (typeof mine)[number]>();
    for (const rv of mine) if (!latest.has(rv.reviewerId)) latest.set(rv.reviewerId, rv);
    const current = [...latest.values()];
    const avg = current.length ? Math.round(current.reduce((a, b) => a + b.weightedScore, 0) / current.length) : null;
    return { ...r.s, author: r.author, reviewCount: current.length, averageScore: avg, history: mine };
  });
}

/** Appends a review (never edits). Decisions are only possible before winners are locked. */
export async function reviewSubmission(
  db: Db,
  user: SessionUser,
  campaign: typeof campaigns.$inferSelect,
  submissionId: string,
  input: { scores: Record<string, number>; privateNote?: string; decision: "shortlist" | "reject" | "none" },
) {
  const rules = (await currentRules(db, campaign)) as CampaignRules;
  const criteria = rules.judgingCriteria ?? [];
  for (const k of Object.keys(input.scores)) if (!criteria.some((c) => c.key === k)) throw badRequest(`Unknown criterion ${k}`);
  const score = weightedScore(criteria, input.scores);
  const [sub] = await db.select().from(creativeSubmissions).where(and(eq(creativeSubmissions.id, submissionId), eq(creativeSubmissions.campaignId, campaign.id))).limit(1);
  if (!sub) throw notFound("Submission not found.");
  if (sub.status === "winner") throw conflict("Winners are locked.");
  await db.transaction(async (tx) => {
    await tx.insert(submissionReviews).values({
      submissionId,
      reviewerId: user.userId,
      scores: input.scores,
      weightedScore: score,
      privateNote: input.privateNote ?? null,
      decision: input.decision === "none" ? null : input.decision,
    });
    if (input.decision !== "none") {
      await tx.update(creativeSubmissions).set({ status: input.decision === "shortlist" ? "shortlisted" : "rejected" }).where(eq(creativeSubmissions.id, submissionId));
    }
    await audit(tx, { actorUserId: user.userId, action: "contest.reviewed", targetType: "submission", targetId: submissionId, metadata: { score, decision: input.decision } });
  });
  return { weightedScore: score };
}

/**
 * Selects winners after the deadline. Irreversible in V1: winners feed the eligibility
 * snapshot, which is frozen and committed on-chain for funded campaigns.
 */
export async function selectWinners(db: Db, user: SessionUser, campaign: typeof campaigns.$inferSelect, submissionIds: string[]) {
  if (campaign.endsAt && campaign.endsAt > new Date()) throw conflict("Winners can be chosen after the contest closes.");
  const rules = (await currentRules(db, campaign)) as CampaignRules;
  if (submissionIds.length === 0) throw badRequest("Pick at least one winner.");
  if (submissionIds.length > rules.reward.winnersCount) throw badRequest(`This contest has ${rules.reward.winnersCount} winner place(s).`);
  if (new Set(submissionIds).size !== submissionIds.length) throw badRequest("Each entry can only win once.");
  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: creativeSubmissions.id }).from(creativeSubmissions).where(and(eq(creativeSubmissions.campaignId, campaign.id), eq(creativeSubmissions.status, "winner")));
    if (existing.length) throw conflict("Winners have already been selected for this contest.");
    const subs = await tx.select().from(creativeSubmissions).where(and(eq(creativeSubmissions.campaignId, campaign.id), inArray(creativeSubmissions.id, submissionIds)));
    if (subs.length !== submissionIds.length) throw badRequest("Some selected entries don't belong to this contest.");
    if (subs.some((s) => s.status === "rejected" || s.status === "withdrawn" || s.moderation !== "approved")) throw badRequest("Rejected or removed entries can't win.");
    await tx.update(creativeSubmissions).set({ status: "winner" }).where(inArray(creativeSubmissions.id, submissionIds));
    await tx.update(campaigns).set({ status: "AWAITING_RESULTS", updatedAt: new Date() }).where(eq(campaigns.id, campaign.id));
    await audit(tx, { actorUserId: user.userId, action: "contest.winners_selected", targetType: "campaign", targetId: campaign.id, metadata: { submissionIds } });
  });
}

export function toCsv(rows: Awaited<ReturnType<typeof listSubmissions>>): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    // neutralize spreadsheet formula injection
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const header = ["id", "title", "author", "status", "average_score_x100", "reviews", "submitted_at", "external_url"];
  return [header.join(","), ...rows.map((r) => [r.id, r.title, r.author, r.status, r.averageScore ?? "", r.reviewCount, r.createdAt.toISOString(), r.externalUrl ?? ""].map(esc).join(","))].join("\n");
}
