import "server-only";
import { cookies, headers } from "next/headers";
import { and, eq, gt, isNull, sessions, users, walletConnections, adminRoles, type Db } from "@yielvy/db";
import { db } from "./db";
import { env } from "./env";
import { ipHash, randomToken, sha256Hex } from "./crypto";

export const SESSION_COOKIE = "yv_session";
const SESSION_DAYS = 30;
/** Organizer finance actions require a wallet signature within this window. */
export const STEP_UP_WINDOW_MS = 12 * 3600 * 1000;

export interface SessionUser {
  sessionId: string;
  userId: string;
  displayName: string;
  email: string | null;
  status: "active" | "suspended";
  walletVerifiedAt: Date | null;
  payoutAccountId: string | null;
  adminRoles: string[];
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

export async function createSession(database: Db, userId: string, opts: { walletVerified: boolean }): Promise<void> {
  const token = randomToken(32);
  const h = await headers();
  await database.insert(sessions).values({
    tokenHash: sha256Hex(token),
    userId,
    walletVerifiedAt: opts.walletVerified ? new Date() : null,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    ipHash: ipHash(await clientIp()),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const database = await db();
  const [row] = await database
    .select({
      sessionId: sessions.id,
      userId: users.id,
      displayName: users.displayName,
      email: users.email,
      status: users.status,
      walletVerifiedAt: sessions.walletVerifiedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256Hex(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  const [payout] = await database
    .select({ accountId: walletConnections.accountId })
    .from(walletConnections)
    .where(and(eq(walletConnections.userId, row.userId), eq(walletConnections.network, env().NEAR_NETWORK), eq(walletConnections.isPayout, true)))
    .limit(1);
  const roles = await database.select({ role: adminRoles.role }).from(adminRoles).where(eq(adminRoles.userId, row.userId));
  return { ...row, payoutAccountId: payout?.accountId ?? null, adminRoles: roles.map((r) => r.role) };
}

export async function revokeCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const database = await db();
    await database.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256Hex(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export async function markSessionWalletVerified(sessionId: string): Promise<void> {
  const database = await db();
  await database.update(sessions).set({ walletVerifiedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export function hasFreshWalletProof(u: SessionUser): boolean {
  return Boolean(u.walletVerifiedAt && Date.now() - u.walletVerifiedAt.getTime() < STEP_UP_WINDOW_MS);
}
