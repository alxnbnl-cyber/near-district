import "server-only";
import { randomBytes } from "node:crypto";
import { and, authChallenges, eq, externalWallets, gt, isNull, users, type Db } from "@yielvy/db";
import { isEvmAddress, isSolanaAddress, toChecksumAddress, verifyExternalSignature, type ExternalChain } from "@yielvy/near";
import { env } from "./env";
import { audit } from "./audit";
import { badRequest, conflict } from "./http";
import type { SessionUser } from "./session";

export const EVM_PAYOUT_CHAINS = ["base", "arbitrum", "ethereum"] as const;
export type EvmPayoutChain = (typeof EVM_PAYOUT_CHAINS)[number];
export type PayoutDestination = { kind: "near" } | { kind: "evm"; chain: EvmPayoutChain; address: string } | { kind: "solana"; address: string };

export function normalizeAddress(chain: ExternalChain, address: string): string {
  const a = address.trim();
  if (chain === "evm") {
    if (!isEvmAddress(a)) throw badRequest("That isn't a valid EVM address.");
    return toChecksumAddress(a);
  }
  if (!isSolanaAddress(a)) throw badRequest("That isn't a valid Solana address.");
  return a;
}

/** One message per chain + address + nonce; the signature is only valid for this exact text. */
export async function issueExternalChallenge(db: Db, user: SessionUser, chain: ExternalChain, rawAddress: string) {
  const address = normalizeAddress(chain, rawAddress);
  const nonce = randomBytes(24).toString("hex");
  const host = new URL(env().APP_URL).host;
  const message = [
    `${host} wants you to prove you own this ${chain === "evm" ? "EVM" : "Solana"} wallet.`,
    "",
    `Address: ${address}`,
    `Yielvy profile: ${user.displayName}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date().toISOString()}`,
    "",
    "Signing is free and sends no transaction.",
  ].join("\n");
  await db.insert(authChallenges).values({ nonce, purpose: `link_${chain}`, userId: user.userId, recipient: address, message, expiresAt: new Date(Date.now() + 10 * 60_000) });
  return { nonce, message, address };
}

export async function verifyExternalChallenge(db: Db, user: SessionUser, input: { chain: ExternalChain; nonce: string; signature: string; walletApp?: string }) {
  const [ch] = await db
    .update(authChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(authChallenges.nonce, input.nonce), eq(authChallenges.userId, user.userId), eq(authChallenges.purpose, `link_${input.chain}`), isNull(authChallenges.consumedAt), gt(authChallenges.expiresAt, new Date())))
    .returning();
  if (!ch) throw badRequest("This signature request expired. Please try again.", "challenge_expired");
  const address = ch.recipient;
  if (!verifyExternalSignature(input.chain, address, ch.message, input.signature)) throw badRequest("The signature doesn't match that wallet.", "signature_invalid");
  const [owned] = await db.select({ userId: externalWallets.userId }).from(externalWallets).where(and(eq(externalWallets.chain, input.chain), eq(externalWallets.address, address))).limit(1);
  if (owned && owned.userId !== user.userId) throw conflict("This wallet is already linked to another Yielvy profile.", "wallet_taken");
  await db
    .insert(externalWallets)
    .values({ userId: user.userId, chain: input.chain, address, walletApp: input.walletApp ?? null, verifiedAt: new Date() })
    .onConflictDoUpdate({ target: [externalWallets.chain, externalWallets.address], set: { verifiedAt: new Date(), walletApp: input.walletApp ?? null } });
  await audit(db, { actorUserId: user.userId, action: `wallet.${input.chain}_linked`, targetType: "wallet", targetId: `${input.chain}:${address}` });
  return { chain: input.chain, address };
}

export async function listExternalWallets(db: Db, userId: string) {
  const rows = await db.select().from(externalWallets).where(eq(externalWallets.userId, userId));
  const [u] = await db.select({ payout: users.payoutDestination }).from(users).where(eq(users.id, userId)).limit(1);
  return {
    wallets: rows.map((r) => ({ chain: r.chain as ExternalChain, address: r.address, walletApp: r.walletApp, verifiedAt: r.verifiedAt.toISOString() })),
    payout: (u?.payout ?? { kind: "near" }) as PayoutDestination,
  };
}

/** A payout destination must be a wallet the player proved they own. */
export async function setPayoutDestination(db: Db, user: SessionUser, dest: PayoutDestination) {
  if (dest.kind !== "near") {
    const chain: ExternalChain = dest.kind === "evm" ? "evm" : "solana";
    const [w] = await db
      .select({ id: externalWallets.id })
      .from(externalWallets)
      .where(and(eq(externalWallets.userId, user.userId), eq(externalWallets.chain, chain), eq(externalWallets.address, normalizeAddress(chain, dest.address))))
      .limit(1);
    if (!w) throw badRequest("Prove you own that wallet first.");
  }
  await db.update(users).set({ payoutDestination: dest }).where(eq(users.id, user.userId));
  await audit(db, { actorUserId: user.userId, action: "payout.destination_set", targetType: "user", targetId: user.userId, metadata: { kind: dest.kind } });
  return dest;
}

/** Sign in with an EVM or Solana wallet: a challenge that isn't tied to a session yet. */
export async function issueWalletLoginChallenge(db: Db, chain: ExternalChain, rawAddress: string) {
  const address = normalizeAddress(chain, rawAddress);
  const nonce = randomBytes(24).toString("hex");
  const host = new URL(env().APP_URL).host;
  const message = [`${host} wants you to sign in with your ${chain === "evm" ? "EVM" : "Solana"} wallet.`, "", `Address: ${address}`, `Nonce: ${nonce}`, `Issued: ${new Date().toISOString()}`, "", "Signing is free and sends no transaction."].join("\n");
  await db.insert(authChallenges).values({ nonce, purpose: `login_${chain}`, userId: null, recipient: address, message, expiresAt: new Date(Date.now() + 10 * 60_000) });
  return { nonce, message, address };
}

/**
 * Verifies the signature and returns the Yielvy user for this wallet, creating one on first sign-in. New users get the
 * wallet's chain as their prize destination (paid through NEAR Intents; simulated on testnet).
 */
export async function verifyWalletLogin(db: Db, input: { chain: ExternalChain; nonce: string; signature: string; walletApp?: string }): Promise<{ userId: string; address: string; created: boolean }> {
  const [ch] = await db
    .update(authChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(authChallenges.nonce, input.nonce), isNull(authChallenges.userId), eq(authChallenges.purpose, `login_${input.chain}`), isNull(authChallenges.consumedAt), gt(authChallenges.expiresAt, new Date())))
    .returning();
  if (!ch) throw badRequest("This signature request expired. Please try again.", "challenge_expired");
  const address = ch.recipient;
  if (!verifyExternalSignature(input.chain, address, ch.message, input.signature)) throw badRequest("The signature doesn't match that wallet.", "signature_invalid");
  return db.transaction(async (tx) => {
    const [w] = await tx.select({ userId: externalWallets.userId }).from(externalWallets).where(and(eq(externalWallets.chain, input.chain), eq(externalWallets.address, address))).limit(1);
    if (w) {
      await tx.update(externalWallets).set({ verifiedAt: new Date() }).where(and(eq(externalWallets.chain, input.chain), eq(externalWallets.address, address)));
      return { userId: w.userId, address, created: false };
    }
    const dest: PayoutDestination = input.chain === "evm" ? { kind: "evm", chain: "base", address } : { kind: "solana", address };
    const [u] = await tx.insert(users).values({ displayName: `${address.slice(0, 6)}…${address.slice(-4)}`, payoutDestination: dest }).returning({ id: users.id });
    await tx.insert(externalWallets).values({ userId: u!.id, chain: input.chain, address, walletApp: input.walletApp ?? null, verifiedAt: new Date() });
    await audit(tx, { actorUserId: u!.id, action: `auth.${input.chain}_identity_created`, targetType: "wallet", targetId: `${input.chain}:${address}` });
    return { userId: u!.id, address, created: true };
  });
}
