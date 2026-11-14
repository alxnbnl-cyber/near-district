import "server-only";
import {
  activityOfferings,
  and,
  campaigns,
  eq,
  inArray,
  notifications,
  or,
  organizationMembers,
  organizationPartnerships,
  organizations,
  spaces,
  sql,
  treasureHints,
  type Db,
} from "@near-district/db";
import { definitionHash, describeActivity, validateActivity, type ActivityDef } from "@near-district/core";
import { audit } from "./audit";
import { requireOrgRole } from "./authz";
import { badRequest, conflict, forbidden, notFound } from "./http";
import type { SessionUser } from "./session";

const INVITE_TTL_MS = 14 * 86_400_000;

/** Notify an organization's owners and admins. */
export async function notifyOrgAdmins(db: Db, orgId: string, n: { kind: string; title: string; body: string; link: string; dedupeKey: string }) {
  const admins = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, orgId), inArray(organizationMembers.role, ["owner", "admin"])));
  for (const a of admins) await db.insert(notifications).values({ userId: a.userId, ...n }).onConflictDoNothing();
}

async function orgBySlug(db: Db, slug: string) {
  const [o] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  return o ?? null;
}

/** CollaborationService.invite — only admins of an approved organization may propose a partnership. */
export async function invitePartner(db: Db, user: SessionUser, orgId: string, input: { organizationSlug: string; message: string }) {
  await requireOrgRole(db, user, orgId, "admin");
  const [me] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  const them = await orgBySlug(db, input.organizationSlug);
  if (!them || them.status !== "approved") throw notFound("No approved organization uses that address.");
  if (them.id === orgId) throw badRequest("You can't partner with yourself.");
  if (me?.status !== "approved") throw forbidden("Your organization must be approved before inviting partners.");
  try {
    const [row] = await db
      .insert(organizationPartnerships)
      .values({ inviterOrgId: orgId, inviteeOrgId: them.id, message: input.message, invitedBy: user.userId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) })
      .returning();
    await audit(db, { actorUserId: user.userId, action: "partnership.invited", targetType: "partnership", targetId: row!.id, metadata: { inviter: orgId, invitee: them.id } });
    await notifyOrgAdmins(db, them.id, {
      kind: "partnership_invite",
      title: `${me.name} invited you to cooperate`,
      body: input.message || "Review the invitation to team up on missions and trails.",
      link: "/organizer/partners",
      dedupeKey: `partnership:${row!.id}`,
    });
    return row!;
  } catch (e) {
    if (String((e as { cause?: { code?: string } }).cause?.code) === "23505") throw conflict("There's already an open invitation or partnership with that organization.");
    throw e;
  }
}

/** Accept/reject (invitee admins) or cancel/end (either side's admins). */
export async function actOnPartnership(db: Db, user: SessionUser, orgId: string, partnershipId: string, action: "accept" | "reject" | "cancel") {
  await requireOrgRole(db, user, orgId, "admin");
  const [p] = await db.select().from(organizationPartnerships).where(eq(organizationPartnerships.id, partnershipId)).limit(1);
  if (!p || (p.inviterOrgId !== orgId && p.inviteeOrgId !== orgId)) throw notFound("Invitation not found.");
  const now = new Date();
  if (p.status === "PENDING" && p.expiresAt < now) {
    await db.update(organizationPartnerships).set({ status: "EXPIRED", decidedAt: now }).where(eq(organizationPartnerships.id, p.id));
    throw conflict("This invitation has expired.");
  }
  let next: "ACCEPTED" | "REJECTED" | "CANCELLED";
  if (action === "accept" || action === "reject") {
    if (p.inviteeOrgId !== orgId) throw forbidden("Only the invited organization can respond.");
    if (p.status !== "PENDING") throw conflict("This invitation was already answered.");
    next = action === "accept" ? "ACCEPTED" : "REJECTED";
  } else {
    if (p.status === "PENDING" && p.inviterOrgId !== orgId) throw forbidden("Decline the invitation instead.");
    if (p.status !== "PENDING" && p.status !== "ACCEPTED") throw conflict("This partnership is already closed.");
    next = "CANCELLED";
  }
  const res = await db
    .update(organizationPartnerships)
    .set({ status: next, decidedBy: user.userId, decidedAt: now })
    .where(and(eq(organizationPartnerships.id, p.id), eq(organizationPartnerships.status, p.status)))
    .returning({ id: organizationPartnerships.id });
  if (!res.length) throw conflict("This invitation changed in the meantime. Refresh and try again.");
  await audit(db, { actorUserId: user.userId, action: `partnership.${next.toLowerCase()}`, targetType: "partnership", targetId: p.id, metadata: { from: p.status, actingOrg: orgId } });
  const other = p.inviterOrgId === orgId ? p.inviteeOrgId : p.inviterOrgId;
  const [me] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  await notifyOrgAdmins(db, other, {
    kind: "partnership_update",
    title: `${me?.name ?? "A partner"} ${next === "ACCEPTED" ? "accepted your invitation" : next === "REJECTED" ? "declined your invitation" : "ended the partnership"}`,
    body: next === "CANCELLED" ? "Hints that used their activities now follow each hint's published withdrawal policy." : "Open Partners for details.",
    link: "/organizer/partners",
    dedupeKey: `partnership:${p.id}:${next}`,
  });
  return { status: next };
}

export async function listPartnerships(db: Db, orgId: string) {
  const rows = await db
    .select()
    .from(organizationPartnerships)
    .where(or(eq(organizationPartnerships.inviterOrgId, orgId), eq(organizationPartnerships.inviteeOrgId, orgId)))
    .orderBy(sql`${organizationPartnerships.createdAt} desc`);
  const ids = [...new Set(rows.flatMap((r) => [r.inviterOrgId, r.inviteeOrgId]))];
  const orgs = ids.length
    ? await db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug, spaceSlug: spaces.slug }).from(organizations).leftJoin(spaces, eq(spaces.organizationId, organizations.id)).where(inArray(organizations.id, ids))
    : [];
  const now = new Date();
  return rows.map((r) => {
    const otherId = r.inviterOrgId === orgId ? r.inviteeOrgId : r.inviterOrgId;
    return {
      id: r.id,
      direction: r.inviterOrgId === orgId ? ("outgoing" as const) : ("incoming" as const),
      status: r.status === "PENDING" && r.expiresAt < now ? ("EXPIRED" as const) : r.status,
      message: r.message,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      partner: orgs.find((o) => o.id === otherId) ?? null,
    };
  });
}

export async function acceptedPartnerIds(db: Db, orgId: string): Promise<string[]> {
  const rows = await db
    .select({ a: organizationPartnerships.inviterOrgId, b: organizationPartnerships.inviteeOrgId })
    .from(organizationPartnerships)
    .where(and(eq(organizationPartnerships.status, "ACCEPTED"), or(eq(organizationPartnerships.inviterOrgId, orgId), eq(organizationPartnerships.inviteeOrgId, orgId))));
  return rows.map((r) => (r.a === orgId ? r.b : r.a));
}

// ---------------------------------------------------------------------------- offerings

/** Internal activities may only reference the offering organization's own campaigns. */
export async function assertActivityOwnership(db: Db, orgId: string, a: ActivityDef, excludeCampaignId?: string) {
  const problems = validateActivity(a);
  if (problems.length) throw badRequest(problems[0]!);
  if ("campaignId" in a) {
    const [c] = await db
      .select({ id: campaigns.id, template: campaigns.template, org: spaces.organizationId })
      .from(campaigns)
      .innerJoin(spaces, eq(spaces.id, campaigns.spaceId))
      .where(eq(campaigns.id, a.campaignId))
      .limit(1);
    if (!c || c.org !== orgId) throw badRequest("Activities can only use your own company's missions.");
    if (c.id === excludeCampaignId) throw badRequest("A hint can't require finishing the same mission it belongs to.");
    const needsHunt = a.type === "internal_quiz" || a.type === "internal_question_sequence";
    if (needsHunt && c.template !== "treasure_hunt") throw badRequest("Quizzes and question sequences must be Treasure Hunts.");
    if (a.type === "internal_contest_entry" && c.template !== "creative_contest") throw badRequest("Challenge entries need a creative challenge.");
  }
}

export async function createOffering(db: Db, user: SessionUser, orgId: string, input: { title: string; description: string; activity: ActivityDef }, opts: { onchainEnabled: boolean }) {
  await requireOrgRole(db, user, orgId, "admin");
  if (!opts.onchainEnabled && input.activity.type.startsWith("near_")) throw badRequest("On-chain activities are only available on mainnet deployments.");
  await assertActivityOwnership(db, orgId, input.activity);
  const [row] = await db
    .insert(activityOfferings)
    .values({ organizationId: orgId, title: input.title, description: input.description, activity: input.activity, definitionHash: definitionHash(input.activity), createdBy: user.userId })
    .returning();
  await audit(db, { actorUserId: user.userId, action: "offering.created", targetType: "offering", targetId: row!.id, metadata: { type: input.activity.type } });
  return row!;
}

export async function withdrawOffering(db: Db, user: SessionUser, orgId: string, offeringId: string) {
  await requireOrgRole(db, user, orgId, "admin");
  const res = await db
    .update(activityOfferings)
    .set({ status: "withdrawn", withdrawnAt: new Date() })
    .where(and(eq(activityOfferings.id, offeringId), eq(activityOfferings.organizationId, orgId), eq(activityOfferings.status, "active")))
    .returning({ id: activityOfferings.id });
  if (!res.length) throw notFound("Offering not found.");
  await audit(db, { actorUserId: user.userId, action: "offering.withdrawn", targetType: "offering", targetId: offeringId });
}

/** Campaign titles for activity descriptions. */
export async function campaignNames(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await db.select({ id: campaigns.id, title: campaigns.title }).from(campaigns).where(inArray(campaigns.id, ids));
  return new Map(rows.map((r) => [r.id, r.title]));
}

/** My offerings, with where partners use them so both sides can review final settings. */
export async function listMyOfferings(db: Db, orgId: string) {
  const rows = await db.select().from(activityOfferings).where(eq(activityOfferings.organizationId, orgId)).orderBy(sql`${activityOfferings.createdAt} desc`);
  const names = await campaignNames(db, rows.flatMap((r) => ("campaignId" in (r.activity as object) ? [(r.activity as { campaignId: string }).campaignId] : [])));
  const usage = rows.length
    ? await db
        .select({ hintId: treasureHints.id, title: treasureHints.title, unlock: treasureHints.unlock, campaign: campaigns.title, status: campaigns.status })
        .from(treasureHints)
        .innerJoin(campaigns, eq(campaigns.id, treasureHints.campaignId))
        .where(sql`${treasureHints.unlock}::text like '%"offeringId"%'`)
    : [];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    activity: r.activity as ActivityDef,
    label: describeActivity(r.activity as ActivityDef, { campaign: (id) => names.get(id) }),
    usedIn: usage.filter((u) => JSON.stringify(u.unlock).includes(r.id)).map((u) => ({ hint: u.title, campaign: u.campaign, status: u.status })),
  }));
}

/** Active offerings from organizations we have an ACCEPTED partnership with. */
export async function partnerOfferings(db: Db, orgId: string) {
  const partners = await acceptedPartnerIds(db, orgId);
  if (!partners.length) return [];
  const rows = await db
    .select({ o: activityOfferings, orgName: organizations.name, spaceSlug: spaces.slug })
    .from(activityOfferings)
    .innerJoin(organizations, eq(organizations.id, activityOfferings.organizationId))
    .leftJoin(spaces, eq(spaces.organizationId, organizations.id))
    .where(and(inArray(activityOfferings.organizationId, partners), eq(activityOfferings.status, "active")));
  const names = await campaignNames(db, rows.flatMap((r) => ("campaignId" in (r.o.activity as object) ? [(r.o.activity as { campaignId: string }).campaignId] : [])));
  return rows.map((r) => ({
    id: r.o.id,
    title: r.o.title,
    description: r.o.description,
    activity: r.o.activity as ActivityDef,
    label: describeActivity(r.o.activity as ActivityDef, { campaign: (id) => names.get(id) }),
    org: { id: r.o.organizationId, name: r.orgName, spaceSlug: r.spaceSlug },
  }));
}
