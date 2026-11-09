import "server-only";
import { randomBytes } from "node:crypto";
import {
  and,
  asc,
  campaigns,
  eq,
  expeditionChapters,
  expeditionPartners,
  expeditionProgress,
  expeditions,
  inArray,
  organizations,
  spaces,
  verifyInternal,
  type Db,
} from "@yielvy/db";
import { definitionHash } from "@yielvy/core";
import { slugify } from "@/lib/schemas";
import { audit } from "./audit";
import { requireOrgRole } from "./authz";
import { badRequest, conflict, forbidden, notFound } from "./http";
import { notifyOrgAdmins } from "./partners";
import type { SessionUser } from "./session";

type ExpeditionRow = typeof expeditions.$inferSelect;

export interface ExpeditionDefinition {
  chapters: { position: number; campaignId: string; organizationId: string }[];
  rewardCampaignId: string | null;
}

async function load(db: Db, id: string): Promise<ExpeditionRow> {
  const [e] = await db.select().from(expeditions).where(eq(expeditions.id, id)).limit(1);
  if (!e) throw notFound("Expedition not found.");
  return e;
}

async function campaignWithOrg(db: Db, campaignId: string) {
  const [c] = await db
    .select({ c: campaigns, org: spaces.organizationId })
    .from(campaigns)
    .innerJoin(spaces, eq(spaces.id, campaigns.spaceId))
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  return c ?? null;
}

function assertDraft(e: ExpeditionRow) {
  if (e.status !== "DRAFT") throw conflict("A published expedition can't change; its route is part of the published rules.");
}

export async function createExpedition(db: Db, user: SessionUser, orgId: string, input: { title: string; summary: string }) {
  await requireOrgRole(db, user, orgId, "admin");
  const slug = `${slugify(input.title) || "expedition"}-${randomBytes(2).toString("hex")}`.slice(0, 48);
  const [row] = await db.insert(expeditions).values({ primaryOrgId: orgId, title: input.title, summary: input.summary, slug, createdBy: user.userId }).returning();
  await audit(db, { actorUserId: user.userId, action: "expedition.created", targetType: "expedition", targetId: row!.id });
  return row!;
}

/** The primary organizer adds one of its own published campaigns as the next chapter. */
export async function addOwnChapter(db: Db, user: SessionUser, orgId: string, expeditionId: string, campaignId: string) {
  const e = await load(db, expeditionId);
  if (e.primaryOrgId !== orgId) throw forbidden("Only the primary organizer adds its own chapters this way.");
  await requireOrgRole(db, user, orgId, "admin");
  assertDraft(e);
  await insertChapter(db, user, e, orgId, campaignId);
}

async function insertChapter(db: Db, user: SessionUser, e: ExpeditionRow, orgId: string, campaignId: string) {
  const c = await campaignWithOrg(db, campaignId);
  if (!c || c.org !== orgId) throw badRequest("Chapters must be your organization's own campaigns.");
  if (!c.c.currentVersion || c.c.moderation !== "approved") throw badRequest("Only published campaigns can be chapters.");
  const existing = await db.select({ position: expeditionChapters.position }).from(expeditionChapters).where(eq(expeditionChapters.expeditionId, e.id));
  if (existing.length >= 8) throw badRequest("An expedition can have at most 8 chapters.");
  try {
    await db.insert(expeditionChapters).values({
      expeditionId: e.id,
      campaignId,
      organizationId: orgId,
      position: existing.length ? Math.max(...existing.map((x) => x.position)) + 1 : 0,
      addedBy: user.userId,
    });
  } catch (err) {
    if (String((err as { cause?: { code?: string } }).cause?.code) === "23505") throw conflict("That campaign is already a chapter.");
    throw err;
  }
  await audit(db, { actorUserId: user.userId, action: "expedition.chapter_added", targetType: "expedition", targetId: e.id, metadata: { campaignId, orgId } });
}

export async function inviteExpeditionPartner(db: Db, user: SessionUser, orgId: string, expeditionId: string, partnerSlug: string) {
  const e = await load(db, expeditionId);
  if (e.primaryOrgId !== orgId) throw forbidden("Only the primary organizer invites partners.");
  await requireOrgRole(db, user, orgId, "admin");
  assertDraft(e);
  const [o] = await db.select().from(organizations).where(eq(organizations.slug, partnerSlug)).limit(1);
  if (!o || o.status !== "approved") throw notFound("No approved organization uses that address.");
  if (o.id === orgId) throw badRequest("You're already the primary organizer.");
  await db
    .insert(expeditionPartners)
    .values({ expeditionId: e.id, organizationId: o.id, invitedBy: user.userId })
    .onConflictDoUpdate({ target: [expeditionPartners.expeditionId, expeditionPartners.organizationId], set: { status: "PENDING", invitedBy: user.userId, decidedAt: null, decidedBy: null } });
  await audit(db, { actorUserId: user.userId, action: "expedition.partner_invited", targetType: "expedition", targetId: e.id, metadata: { partner: o.id } });
  await notifyOrgAdmins(db, o.id, {
    kind: "expedition_invite",
    title: `You're invited to the expedition “${e.title}”`,
    body: "Contribute one of your campaigns as a chapter, or decline.",
    link: "/organizer/expeditions",
    dedupeKey: `expedition:${e.id}:invite`,
  });
}

/** A partner accepts by contributing one of its own published campaigns, or declines. */
export async function respondExpeditionInvite(db: Db, user: SessionUser, orgId: string, expeditionId: string, decision: "accept" | "reject", campaignId?: string) {
  await requireOrgRole(db, user, orgId, "admin");
  const e = await load(db, expeditionId);
  assertDraft(e);
  const [p] = await db.select().from(expeditionPartners).where(and(eq(expeditionPartners.expeditionId, e.id), eq(expeditionPartners.organizationId, orgId))).limit(1);
  if (!p) throw notFound("Invitation not found.");
  if (p.status !== "PENDING") throw conflict("This invitation was already answered.");
  if (decision === "accept") {
    if (!campaignId) throw badRequest("Pick the campaign you contribute as your chapter.");
    await insertChapter(db, user, e, orgId, campaignId);
  }
  await db
    .update(expeditionPartners)
    .set({ status: decision === "accept" ? "ACCEPTED" : "REJECTED", decidedBy: user.userId, decidedAt: new Date() })
    .where(and(eq(expeditionPartners.expeditionId, e.id), eq(expeditionPartners.organizationId, orgId)));
  await audit(db, { actorUserId: user.userId, action: `expedition.partner_${decision === "accept" ? "accepted" : "rejected"}`, targetType: "expedition", targetId: e.id, metadata: { campaignId } });
  await notifyOrgAdmins(db, e.primaryOrgId, {
    kind: "expedition_update",
    title: `A partner ${decision === "accept" ? "joined" : "declined"} “${e.title}”`,
    body: decision === "accept" ? "Their chapter was added. Review the order before publishing." : "You can invite another organization.",
    link: `/organizer/expeditions/${e.id}`,
    dedupeKey: `expedition:${e.id}:${orgId}:${decision}`,
  });
}

/** Primary organizer reorders chapters, or removes one (a partner may withdraw its own chapter while DRAFT). */
export async function setChapterOrder(db: Db, user: SessionUser, orgId: string, expeditionId: string, orderedCampaignIds: string[]) {
  const e = await load(db, expeditionId);
  if (e.primaryOrgId !== orgId) throw forbidden();
  await requireOrgRole(db, user, orgId, "admin");
  assertDraft(e);
  const rows = await db.select().from(expeditionChapters).where(eq(expeditionChapters.expeditionId, e.id));
  if (rows.length !== orderedCampaignIds.length || !rows.every((r) => orderedCampaignIds.includes(r.campaignId))) throw badRequest("The order must include every chapter exactly once.");
  await db.transaction(async (tx) => {
    for (const [i, cid] of orderedCampaignIds.entries()) await tx.update(expeditionChapters).set({ position: 1000 + i }).where(and(eq(expeditionChapters.expeditionId, e.id), eq(expeditionChapters.campaignId, cid)));
    for (const [i, cid] of orderedCampaignIds.entries()) await tx.update(expeditionChapters).set({ position: i }).where(and(eq(expeditionChapters.expeditionId, e.id), eq(expeditionChapters.campaignId, cid)));
  });
  await audit(db, { actorUserId: user.userId, action: "expedition.reordered", targetType: "expedition", targetId: e.id });
}

export async function removeChapter(db: Db, user: SessionUser, orgId: string, expeditionId: string, campaignId: string) {
  const e = await load(db, expeditionId);
  await requireOrgRole(db, user, orgId, "admin");
  assertDraft(e);
  const [ch] = await db.select().from(expeditionChapters).where(and(eq(expeditionChapters.expeditionId, e.id), eq(expeditionChapters.campaignId, campaignId))).limit(1);
  if (!ch) throw notFound("Chapter not found.");
  if (e.primaryOrgId !== orgId && ch.organizationId !== orgId) throw forbidden("You can only withdraw your own chapter.");
  await db.delete(expeditionChapters).where(eq(expeditionChapters.id, ch.id));
  if (ch.organizationId !== e.primaryOrgId) {
    await db.update(expeditionPartners).set({ status: "CANCELLED", decidedAt: new Date(), decidedBy: user.userId }).where(and(eq(expeditionPartners.expeditionId, e.id), eq(expeditionPartners.organizationId, ch.organizationId)));
  }
  if (e.rewardCampaignId === campaignId) await db.update(expeditions).set({ rewardCampaignId: null }).where(eq(expeditions.id, e.id));
  const rest = await db.select().from(expeditionChapters).where(eq(expeditionChapters.expeditionId, e.id)).orderBy(asc(expeditionChapters.position));
  await setChapterOrderUnchecked(db, e.id, rest.map((r) => r.campaignId));
  await audit(db, { actorUserId: user.userId, action: "expedition.chapter_removed", targetType: "expedition", targetId: e.id, metadata: { campaignId } });
}

async function setChapterOrderUnchecked(db: Db, expeditionId: string, ids: string[]) {
  for (const [i, cid] of ids.entries()) await db.update(expeditionChapters).set({ position: 1000 + i }).where(and(eq(expeditionChapters.expeditionId, expeditionId), eq(expeditionChapters.campaignId, cid)));
  for (const [i, cid] of ids.entries()) await db.update(expeditionChapters).set({ position: i }).where(and(eq(expeditionChapters.expeditionId, expeditionId), eq(expeditionChapters.campaignId, cid)));
}

/**
 * The reward chapter must be the primary organizer's own, final chapter. Its prize is funded and paid by
 * the existing vault/reward engine; joining it requires a completed expedition (see assertExpeditionGate).
 */
export async function setRewardChapter(db: Db, user: SessionUser, orgId: string, expeditionId: string, campaignId: string | null) {
  const e = await load(db, expeditionId);
  if (e.primaryOrgId !== orgId) throw forbidden();
  await requireOrgRole(db, user, orgId, "admin");
  assertDraft(e);
  await db.update(expeditions).set({ rewardCampaignId: campaignId, updatedAt: new Date() }).where(eq(expeditions.id, e.id));
  await audit(db, { actorUserId: user.userId, action: "expedition.reward_chapter_set", targetType: "expedition", targetId: e.id, metadata: { campaignId } });
}

export async function expeditionProblems(db: Db, e: ExpeditionRow): Promise<string[]> {
  const problems: string[] = [];
  const chapters = await db.select().from(expeditionChapters).where(eq(expeditionChapters.expeditionId, e.id)).orderBy(asc(expeditionChapters.position));
  const partners = await db.select().from(expeditionPartners).where(eq(expeditionPartners.expeditionId, e.id));
  if (chapters.length < 2) problems.push("Add at least two chapters.");
  if (partners.some((p) => p.status === "PENDING")) problems.push("Wait for every invited partner to respond, or cancel their invitation.");
  for (const ch of chapters) {
    if (ch.organizationId !== e.primaryOrgId && !partners.some((p) => p.organizationId === ch.organizationId && p.status === "ACCEPTED")) problems.push("Every partner chapter needs that partner's approval.");
    const c = await campaignWithOrg(db, ch.campaignId);
    if (!c?.c.currentVersion || c.c.moderation !== "approved") problems.push(`“${c?.c.title ?? "A chapter"}” isn't published.`);
  }
  if (e.rewardCampaignId) {
    const last = chapters.at(-1);
    if (!last || last.campaignId !== e.rewardCampaignId || last.organizationId !== e.primaryOrgId) problems.push("The reward chapter must be your own, final chapter.");
  }
  return [...new Set(problems)];
}

export async function publishExpedition(db: Db, user: SessionUser, orgId: string, expeditionId: string) {
  const e = await load(db, expeditionId);
  if (e.primaryOrgId !== orgId) throw forbidden();
  await requireOrgRole(db, user, orgId, "admin");
  assertDraft(e);
  const problems = await expeditionProblems(db, e);
  if (problems.length) throw badRequest(problems[0]!, "not_publishable");
  const chapters = await db.select().from(expeditionChapters).where(eq(expeditionChapters.expeditionId, e.id)).orderBy(asc(expeditionChapters.position));
  const definition: ExpeditionDefinition = { chapters: chapters.map((c) => ({ position: c.position, campaignId: c.campaignId, organizationId: c.organizationId })), rewardCampaignId: e.rewardCampaignId };
  const hash = definitionHash(definition);
  await db.update(expeditions).set({ status: "PUBLISHED", definition, definitionHash: hash, publishedAt: new Date(), updatedAt: new Date() }).where(and(eq(expeditions.id, e.id), eq(expeditions.status, "DRAFT")));
  await audit(db, { actorUserId: user.userId, action: "expedition.published", targetType: "expedition", targetId: e.id, metadata: { definitionHash: hash } });
}

// ---------------------------------------------------------------------------- progress

/**
 * ExpeditionProgressService: a chapter counts when its campaign is genuinely complete (hunt finished /
 * contest entry submitted). Chapters unlock in order; progress = leading completed chapters.
 */
export async function computeProgress(db: Db, userId: string, e: ExpeditionRow) {
  const def = e.definition as ExpeditionDefinition | null;
  if (!def) return { completed: 0, total: 0, done: [] as boolean[], completedAt: null as Date | null };
  const done: boolean[] = [];
  for (const ch of def.chapters) {
    const r = await verifyInternal(db, userId, { type: "internal_campaign_completion", campaignId: ch.campaignId });
    done.push(r.ok);
  }
  let completed = 0;
  while (completed < done.length && done[completed]) completed++;
  // The reward chapter is gated by the others; expedition completion = every non-reward chapter in order.
  const required = def.rewardCampaignId ? def.chapters.length - 1 : def.chapters.length;
  const finished = completed >= required;
  const [prev] = await db.select().from(expeditionProgress).where(and(eq(expeditionProgress.expeditionId, e.id), eq(expeditionProgress.userId, userId))).limit(1);
  const completedAt = prev?.completedAt ?? (finished ? new Date() : null);
  if (!prev || prev.completedChapters !== completed || (finished && !prev.completedAt)) {
    await db
      .insert(expeditionProgress)
      .values({ expeditionId: e.id, userId, completedChapters: completed, definitionHash: e.definitionHash!, completedAt })
      .onConflictDoUpdate({ target: [expeditionProgress.expeditionId, expeditionProgress.userId], set: { completedChapters: completed, completedAt, updatedAt: new Date() } });
    if (finished && !prev?.completedAt) await audit(db, { actorUserId: userId, action: "expedition.completed", targetType: "expedition", targetId: e.id, metadata: { definitionHash: e.definitionHash } });
  }
  return { completed, total: def.chapters.length, done, completedAt };
}

/** Joining a reward chapter requires every earlier chapter of the published expedition. */
export async function assertExpeditionGate(db: Db, userId: string, campaignId: string) {
  const gated = await db.select().from(expeditions).where(and(eq(expeditions.rewardCampaignId, campaignId), eq(expeditions.status, "PUBLISHED")));
  for (const e of gated) {
    const p = await computeProgress(db, userId, e);
    const def = e.definition as ExpeditionDefinition;
    if (p.completed < def.chapters.length - 1) throw forbidden(`This is the final chapter of the expedition “${e.title}”. Complete the earlier chapters first.`);
  }
}

// ---------------------------------------------------------------------------- views

export async function organizerExpeditions(db: Db, orgId: string) {
  const own = await db.select().from(expeditions).where(eq(expeditions.primaryOrgId, orgId));
  const invited = await db
    .select({ e: expeditions, status: expeditionPartners.status })
    .from(expeditionPartners)
    .innerJoin(expeditions, eq(expeditions.id, expeditionPartners.expeditionId))
    .where(eq(expeditionPartners.organizationId, orgId));
  return { own, invited: invited.map((r) => ({ ...r.e, invitation: r.status })) };
}

export async function expeditionDetail(db: Db, id: string) {
  const e = await load(db, id);
  const chapters = await db
    .select({ ch: expeditionChapters, title: campaigns.title, slug: campaigns.slug, template: campaigns.template, status: campaigns.status, spaceSlug: spaces.slug, spaceName: spaces.name, spaceId: spaces.id })
    .from(expeditionChapters)
    .innerJoin(campaigns, eq(campaigns.id, expeditionChapters.campaignId))
    .innerJoin(spaces, eq(spaces.id, campaigns.spaceId))
    .where(eq(expeditionChapters.expeditionId, e.id))
    .orderBy(asc(expeditionChapters.position));
  const partners = await db
    .select({ p: expeditionPartners, name: organizations.name, slug: organizations.slug })
    .from(expeditionPartners)
    .innerJoin(organizations, eq(organizations.id, expeditionPartners.organizationId))
    .where(eq(expeditionPartners.expeditionId, e.id));
  const [primary] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, e.primaryOrgId)).limit(1);
  return { expedition: e, primaryName: primary?.name ?? "", chapters, partners, problems: e.status === "DRAFT" ? await expeditionProblems(db, e) : [] };
}

/** Published expeditions for the map / public page, with the viewer's real progress. */
export async function publicExpeditions(db: Db, viewerId: string | null) {
  const rows = await db.select().from(expeditions).where(eq(expeditions.status, "PUBLISHED"));
  if (!rows.length) return [];
  const campIds = rows.flatMap((e) => (e.definition as ExpeditionDefinition).chapters.map((c) => c.campaignId));
  const camps = await db
    .select({ id: campaigns.id, title: campaigns.title, slug: campaigns.slug, template: campaigns.template, spaceId: spaces.id, spaceSlug: spaces.slug, spaceName: spaces.name, moderation: spaces.moderation })
    .from(campaigns)
    .innerJoin(spaces, eq(spaces.id, campaigns.spaceId))
    .where(inArray(campaigns.id, campIds));
  const out = [];
  for (const e of rows) {
    const def = e.definition as ExpeditionDefinition;
    const progress = viewerId ? await computeProgress(db, viewerId, e) : null;
    const chapters = def.chapters.map((ch, i) => {
      const c = camps.find((x) => x.id === ch.campaignId);
      return {
        campaignId: ch.campaignId,
        title: c?.title ?? "Chapter",
        campaignSlug: c?.slug ?? "",
        template: c?.template ?? "treasure_hunt",
        spaceId: c?.spaceId ?? "",
        spaceSlug: c?.spaceSlug ?? "",
        spaceName: c?.spaceName ?? "",
        completed: progress ? Boolean(progress.done[i]) : false,
        unlocked: progress ? i <= progress.completed : i === 0,
        reward: def.rewardCampaignId === ch.campaignId,
      };
    });
    if (chapters.some((c) => !c.spaceId)) continue;
    out.push({ id: e.id, slug: e.slug, title: e.title, summary: e.summary, chapters, completedAt: progress?.completedAt?.toISOString() ?? null });
  }
  return out;
}
