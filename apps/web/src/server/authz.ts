import "server-only";
import { and, eq, organizationMembers, spaces, campaigns, type Db } from "@near-district/db";
import { forbidden, HttpError, notFound } from "./http";
import { hasFreshWalletProof, type SessionUser } from "./session";

export type OrgRole = "owner" | "admin" | "editor" | "reviewer";
const RANK: Record<OrgRole, number> = { reviewer: 1, editor: 2, admin: 3, owner: 4 };

export async function orgRole(db: Db, userId: string, organizationId: string): Promise<OrgRole | null> {
  const [m] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, organizationId)))
    .limit(1);
  return (m?.role as OrgRole | undefined) ?? null;
}

export async function requireOrgRole(db: Db, user: SessionUser, organizationId: string, min: OrgRole): Promise<OrgRole> {
  const role = await orgRole(db, user.userId, organizationId);
  if (!role || RANK[role] < RANK[min]) throw forbidden();
  return role;
}

/** Loads a campaign and checks the caller's role in the owning organization. */
export async function requireCampaignAccess(db: Db, user: SessionUser, campaignId: string, min: OrgRole) {
  const [row] = await db
    .select({ campaign: campaigns, space: spaces })
    .from(campaigns)
    .innerJoin(spaces, eq(spaces.id, campaigns.spaceId))
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  if (!row) throw notFound("Mission not found.");
  const role = await requireOrgRole(db, user, row.space.organizationId, min);
  return { ...row, role };
}

export function requireAdmin(user: SessionUser | null, roles: string[] = ["superadmin"]): SessionUser {
  if (!user) throw new HttpError(401, "Please sign in first.");
  if (!user.adminRoles.some((r) => r === "superadmin" || roles.includes(r))) throw forbidden();
  return user;
}

/** Financial organizer actions need a recent wallet signature in this session. */
export function requireWalletStepUp(user: SessionUser): void {
  if (!user.payoutAccountId) throw new HttpError(403, "Connect and verify a NEAR wallet first.", "wallet_required");
  if (!hasFreshWalletProof(user)) {
    throw new HttpError(403, "Please re-confirm your wallet to continue.", "step_up_required");
  }
}
