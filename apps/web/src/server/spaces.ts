import "server-only";
import { assignBuildingPlot, eq, organizationMembers, organizations, spaces, and, type Db } from "@near-district/db";
import type { SpaceInput } from "@/lib/schemas";
import { audit } from "./audit";
import { conflict, HttpError } from "./http";
import type { SessionUser } from "./session";

/** The organization (and Space) the user belongs to, if any. V1: one org per organizer. */
export async function myOrganization(db: Db, userId: string) {
  const [row] = await db
    .select({ org: organizations, role: organizationMembers.role, space: spaces })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .leftJoin(spaces, eq(spaces.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Creates organization + Space + world plot atomically. New Spaces start "pending" and
 * appear in the world only after an admin approves them.
 */
export async function createSpace(db: Db, user: SessionUser, input: SpaceInput) {
  if (!user.payoutAccountId) {
    throw new HttpError(403, "Link and verify a NEAR wallet before opening a vault.", "wallet_required");
  }
  if (await myOrganization(db, user.userId)) throw conflict("You already manage a vault.", "space_exists");
  const [taken] = await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.slug, input.slug)).limit(1);
  if (taken) throw conflict("That web address is taken. Try another.", "slug_taken");

  try {
    return await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({ name: input.organizationName, slug: input.slug, createdBy: user.userId, status: "pending" })
        .returning();
      await tx.insert(organizationMembers).values({ organizationId: org!.id, userId: user.userId, role: "owner" });
      const [space] = await tx
        .insert(spaces)
        .values({
          organizationId: org!.id,
          name: input.name,
          slug: input.slug,
          category: input.category,
          tagline: input.tagline,
          description: input.description,
          websiteUrl: input.websiteUrl ?? null,
          socials: Object.fromEntries(Object.entries(input.socials).filter(([, v]) => v)) as Record<string, string>,
          buildingStyle: input.buildingStyle,
          moderation: "pending",
        })
        .returning();
      const plot = await assignBuildingPlot(tx, space!.id, input.category);
      await audit(tx, {
        actorUserId: user.userId,
        action: "space.created",
        targetType: "space",
        targetId: space!.id,
        metadata: { slug: input.slug, ...plot, ownerWallet: user.payoutAccountId },
      });
      return { space: space!, plot };
    });
  } catch (e) {
    if (String((e as { cause?: { code?: string } })?.cause?.code ?? (e as { code?: string })?.code) === "23505") {
      throw conflict("That web address is taken. Try another.", "slug_taken");
    }
    throw e;
  }
}

export async function updateSpace(
  db: Db,
  user: SessionUser,
  spaceId: string,
  patch: Partial<{ name: string; tagline: string; description: string; websiteUrl?: string; socials: Record<string, string | undefined>; buildingStyle: string; logoUploadId: string | null; bannerUploadId: string | null }>,
) {
  const [s] = await db.select().from(spaces).where(eq(spaces.id, spaceId)).limit(1);
  if (!s) throw new HttpError(404, "Company not found.");
  const [m] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, s.organizationId), eq(organizationMembers.userId, user.userId)))
    .limit(1);
  if (!m || !["owner", "admin", "editor"].includes(m.role)) throw new HttpError(403, "You can't edit this company profile.");
  const values: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["name", "tagline", "description", "buildingStyle", "logoUploadId", "bannerUploadId"] as const) {
    if (patch[k] !== undefined) values[k] = patch[k];
  }
  if (patch.websiteUrl !== undefined) values.websiteUrl = patch.websiteUrl || null;
  if (patch.socials) values.socials = Object.fromEntries(Object.entries(patch.socials).filter(([, v]) => v));
  // Renaming an approved Space sends it back for review to prevent bait-and-switch impersonation.
  if (patch.name && patch.name !== s.name && s.moderation === "approved") values.moderation = "pending";
  await db.update(spaces).set(values).where(eq(spaces.id, spaceId));
  await audit(db, { actorUserId: user.userId, action: "space.updated", targetType: "space", targetId: spaceId, metadata: { fields: Object.keys(values) } });
}
