import { eq, organizations, spaces } from "@yielvy/db";
import { notFound, route } from "@/server/http";
import { db } from "@/server/db";
import { myOrganization } from "@/server/spaces";
import { demoEnabled } from "@/server/demo";
import { audit } from "@/server/audit";

/**
 * Local demo only (DEMO_REWARDS=1, never in production): approves the caller's own pending
 * project so the full host flow can be tried without an admin. Real projects are reviewed.
 */
export const POST = route(
  async (_req, { user }) => {
    if (!demoEnabled()) throw notFound();
    const database = await db();
    const mine = await myOrganization(database, user!.userId);
    if (!mine?.space) throw notFound("You don't have a project yet.");
    if (mine.space.moderation === "approved" && mine.org.status === "approved") return { approved: true, changed: false };
    if (mine.space.moderation !== "pending") return { approved: false, changed: false };
    await database.transaction(async (tx) => {
      await tx.update(spaces).set({ moderation: "approved", updatedAt: new Date() }).where(eq(spaces.id, mine.space!.id));
      await tx.update(organizations).set({ status: "approved" }).where(eq(organizations.id, mine.org.id));
      await audit(tx, { actorUserId: user!.userId, action: "space.demo_auto_approved", targetType: "space", targetId: mine.space!.id });
    });
    return { approved: true, changed: true };
  },
  { auth: "required" },
);
