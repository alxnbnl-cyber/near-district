import { z } from "zod";
import { and, emailLoginTokens, eq, gt, isNull, sql, userIdentities, users } from "@yielvy/db";
import { badRequest, body, route } from "@/server/http";
import { db } from "@/server/db";
import { sha256Hex } from "@/server/crypto";
import { createSession } from "@/server/session";
import { audit } from "@/server/audit";

const input = z.object({ token: z.string().min(20).max(100) });

/** POST only: email link scanners issue GETs, so a GET must never consume the token. */
export const POST = route(async (req) => {
  const { token } = await body(req, input);
  const database = await db();
  const userId = await database.transaction(async (tx) => {
    const [t] = await tx
      .update(emailLoginTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(emailLoginTokens.tokenHash, sha256Hex(token)), isNull(emailLoginTokens.consumedAt), gt(emailLoginTokens.expiresAt, new Date())))
      .returning();
    if (!t) throw badRequest("This sign-in link has expired or was already used. Request a new one.", "invalid_token");
    const [existing] = await tx
      .select({ userId: userIdentities.userId })
      .from(userIdentities)
      .where(and(eq(userIdentities.provider, "email"), eq(userIdentities.subject, t.email)))
      .limit(1);
    if (existing) return existing.userId;
    const [byEmail] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${t.email}`).limit(1);
    const id =
      byEmail?.id ??
      (await tx.insert(users).values({ displayName: t.email.split("@")[0]!.slice(0, 40), email: t.email }).returning({ id: users.id }))[0]!.id;
    await tx.insert(userIdentities).values({ userId: id, provider: "email", subject: t.email, verifiedAt: new Date() });
    await audit(tx, { actorUserId: id, action: "auth.email_identity_created", targetType: "user", targetId: id });
    return id;
  });
  await createSession(database, userId, { walletVerified: false });
  return { ok: true };
});
