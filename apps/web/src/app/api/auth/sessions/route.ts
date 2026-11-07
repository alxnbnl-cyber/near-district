import { cookies } from "next/headers";
import { eq, sessions } from "@yielvy/db";
import { route } from "@/server/http";
import { db } from "@/server/db";
import { SESSION_COOKIE } from "@/server/session";
import { audit } from "@/server/audit";

/** Revokes every session of the current user (e.g. after a lost device). */
export const DELETE = route(
  async (_req, { user }) => {
    const database = await db();
    await database.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, user!.userId));
    (await cookies()).delete(SESSION_COOKIE);
    await audit(database, { actorUserId: user!.userId, action: "auth.sessions_revoked_all", targetType: "user", targetId: user!.userId });
    return { ok: true };
  },
  { auth: "required" },
);
