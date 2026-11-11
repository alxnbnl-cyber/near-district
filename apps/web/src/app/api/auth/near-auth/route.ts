import { z } from "zod";
import { and, eq, userIdentities, users, walletConnections } from "@yielvy/db";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { ipHash } from "@/server/crypto";
import { rateLimit } from "@/server/rate-limit";
import { audit } from "@/server/audit";
import { clientIp, createSession } from "@/server/session";
import { deriveNearAccount, verifyNearAuthIdToken } from "@/server/near-auth";

const input = z.object({ idToken: z.string().min(100).max(8000) });

/**
 * Sign in with NEAR Auth (Google / email via Auth0 + NEAR MPC). First sign-in creates the Yielvy profile and its NEAR
 * wallet: the implicit account of the MPC-derived key, recorded as the verified payout wallet. No seed phrase.
 */
export const POST = route(async (req) => {
  const { idToken } = await body(req, input);
  const database = await db();
  await rateLimit(database, `near-auth:${ipHash(await clientIp()) ?? "unknown"}`, 30, 600);
  const claims = await verifyNearAuthIdToken(idToken);
  const { publicKey, accountId } = await deriveNearAccount(claims.sub);
  const network = env().NEAR_NETWORK;
  const subject = `${network}:${claims.sub}`;

  const userId = await database.transaction(async (tx) => {
    const [existing] = await tx.select({ userId: userIdentities.userId }).from(userIdentities).where(and(eq(userIdentities.provider, "near_auth"), eq(userIdentities.subject, subject))).limit(1);
    if (existing) return existing.userId;
    const display = (claims.name ?? claims.email?.split("@")[0] ?? "explorer").slice(0, 40);
    const [u] = await tx.insert(users).values({ displayName: display }).returning({ id: users.id });
    await tx.insert(userIdentities).values({ userId: u!.id, provider: "near_auth", subject, verifiedAt: new Date() });
    await tx
      .insert(walletConnections)
      .values({ userId: u!.id, network, accountId, publicKey, isPayout: true, walletApp: "near-auth", verifiedAt: new Date() })
      .onConflictDoNothing();
    await audit(tx, { actorUserId: u!.id, action: "auth.near_auth_identity_created", targetType: "wallet", targetId: `${network}:${accountId}` });
    return u!.id;
  });
  await createSession(database, userId, { walletVerified: true });
  return { ok: true, accountId };
});
