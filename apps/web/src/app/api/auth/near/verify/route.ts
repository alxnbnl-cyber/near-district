import { z } from "zod";
import { and, authChallenges, eq, gt, isNull, userIdentities, users, walletConnections } from "@near-district/db";
import { verifyAccountOwnership } from "@near-district/near";
import { badRequest, body, conflict, forbidden, route } from "@/server/http";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { nearRpc } from "@/server/near";
import { createSession, markSessionWalletVerified } from "@/server/session";
import { audit } from "@/server/audit";

const input = z.object({
  nonce: z.string().min(40).max(60),
  accountId: z.string().min(2).max(64),
  publicKey: z.string().startsWith("ed25519:").max(80),
  signature: z.string().min(40).max(200),
  /** Reported by the wallet selector; only used to recognise partner wallets (never for security). */
  walletApp: z.enum(["meteor-wallet", "my-near-wallet", "here-wallet", "intear-wallet", "sender", "hot-wallet"]).optional(),
});

export const POST = route(async (req, { user }) => {
  const { nonce, accountId, publicKey, signature, walletApp } = await body(req, input);
  const database = await db();

  // Consume the challenge atomically so it can never be replayed.
  const [ch] = await database
    .update(authChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(authChallenges.nonce, nonce), isNull(authChallenges.consumedAt), gt(authChallenges.expiresAt, new Date())))
    .returning();
  if (!ch) throw badRequest("This signature request expired. Please try again.", "challenge_expired");
  if (ch.purpose !== "near_login" && ch.userId !== user?.userId) throw forbidden("This challenge belongs to another session.");

  const proof = await verifyAccountOwnership(nearRpc(), accountId, publicKey, signature, {
    message: ch.message,
    nonce: Uint8Array.from(Buffer.from(nonce, "base64")),
    recipient: ch.recipient,
    callbackUrl: null,
  });
  if (!proof.ok) throw badRequest(`Could not verify wallet ownership: ${proof.reason}.`, "signature_invalid");

  const network = env().NEAR_NETWORK;
  const subject = `${network}:${accountId}`;
  const [existingIdentity] = await database
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(and(eq(userIdentities.provider, "near"), eq(userIdentities.subject, subject)))
    .limit(1);

  if (ch.purpose === "near_login") {
    const userId = await database.transaction(async (tx) => {
      if (existingIdentity) return existingIdentity.userId;
      const [u] = await tx.insert(users).values({ displayName: accountId.slice(0, 40) }).returning({ id: users.id });
      await tx.insert(userIdentities).values({ userId: u!.id, provider: "near", subject, verifiedAt: new Date() });
      await tx.insert(walletConnections).values({ userId: u!.id, network, accountId, publicKey, isPayout: true, walletApp: walletApp ?? null, verifiedAt: new Date() });
      await audit(tx, { actorUserId: u!.id, action: "auth.near_identity_created", targetType: "wallet", targetId: subject });
      return u!.id;
    });
    await createSession(database, userId, { walletVerified: true });
    return { ok: true };
  }

  // link_wallet / step_up require the signed-in user
  const me = user!;
  if (existingIdentity && existingIdentity.userId !== me.userId) {
    throw conflict("This NEAR account is already linked to a different NEAR District profile.", "wallet_taken");
  }
  if (ch.purpose === "step_up" && me.payoutAccountId !== accountId) {
    throw forbidden("Please confirm with the wallet linked to your profile.");
  }
  await database.transaction(async (tx) => {
    if (!existingIdentity) {
      await tx.insert(userIdentities).values({ userId: me.userId, provider: "near", subject, verifiedAt: new Date() });
    }
    const hasPayout = Boolean(me.payoutAccountId);
    await tx
      .insert(walletConnections)
      .values({ userId: me.userId, network, accountId, publicKey, isPayout: !hasPayout, walletApp: walletApp ?? null, verifiedAt: new Date() })
      .onConflictDoUpdate({ target: [walletConnections.network, walletConnections.accountId], set: { verifiedAt: new Date(), publicKey, ...(walletApp ? { walletApp } : {}) } });
    await audit(tx, { actorUserId: me.userId, action: `auth.${ch.purpose}`, targetType: "wallet", targetId: subject });
  });
  await markSessionWalletVerified(me.sessionId);
  return { ok: true };
});
