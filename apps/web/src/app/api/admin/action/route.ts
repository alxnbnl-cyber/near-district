import { z } from "zod";
import { eq, moderationReports, organizations, qualifications, sessions, spaces, users, campaigns } from "@yielvy/db";
import { body, notFound, route } from "@/server/http";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/authz";
import { audit } from "@/server/audit";
import { ipHash } from "@/server/crypto";
import { clientIp } from "@/server/session";
import { plainText } from "@/lib/schemas";

const input = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("space"), id: z.string().uuid(), decision: z.enum(["approved", "rejected", "suspended"]), reason: plainText(500).default("") }),
  z.object({ kind: z.literal("campaign"), id: z.string().uuid(), decision: z.enum(["approved", "suspended"]), reason: plainText(500).default("") }),
  z.object({ kind: z.literal("report"), id: z.string().uuid(), decision: z.enum(["actioned", "dismissed"]), reason: plainText(500).default("") }),
  z.object({ kind: z.literal("qualification"), id: z.string().uuid(), decision: z.enum(["qualified", "revoked"]), reason: plainText(500).min(3) }),
  z.object({ kind: z.literal("user"), id: z.string().uuid(), decision: z.enum(["active", "suspended"]), reason: plainText(500).min(3) }),
]);

/**
 * Moderation and risk decisions. Every action is role-checked and audit-logged with a reason.
 * Admins have NO action here (or anywhere) that edits balances or moves vault funds.
 */
export const POST = route(
  async (req, { user }) => {
    const a = await body(req, input);
    const admin = requireAdmin(user, a.kind === "qualification" || a.kind === "user" ? ["moderator", "finance"] : ["moderator"]);
    const database = await db();
    await database.transaction(async (tx) => {
      switch (a.kind) {
        case "space": {
          const [s] = await tx.update(spaces).set({ moderation: a.decision, updatedAt: new Date() }).where(eq(spaces.id, a.id)).returning();
          if (!s) throw notFound();
          await tx.update(organizations).set({ status: a.decision }).where(eq(organizations.id, s.organizationId));
          break;
        }
        case "campaign": {
          const res = await tx
            .update(campaigns)
            .set({ moderation: a.decision, ...(a.decision === "suspended" ? { status: "SUSPENDED" as const } : {}), updatedAt: new Date() })
            .where(eq(campaigns.id, a.id))
            .returning();
          if (!res.length) throw notFound();
          break;
        }
        case "report": {
          const res = await tx.update(moderationReports).set({ status: a.decision, resolvedBy: admin.userId, resolution: a.reason }).where(eq(moderationReports.id, a.id)).returning();
          if (!res.length) throw notFound();
          break;
        }
        case "qualification": {
          const res = await tx.update(qualifications).set({ status: a.decision, holdReason: a.reason }).where(eq(qualifications.id, a.id)).returning();
          if (!res.length) throw notFound();
          break;
        }
        case "user": {
          const res = await tx.update(users).set({ status: a.decision, suspendedReason: a.decision === "suspended" ? a.reason : null }).where(eq(users.id, a.id)).returning();
          if (!res.length) throw notFound();
          if (a.decision === "suspended") await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, a.id));
          break;
        }
      }
      await audit(tx, { actorUserId: admin.userId, action: `admin.${a.kind}.${a.decision}`, targetType: a.kind, targetId: a.id, metadata: { reason: a.reason }, ipHash: ipHash(await clientIp()) });
    });
    return { ok: true };
  },
  { auth: "required" },
);
