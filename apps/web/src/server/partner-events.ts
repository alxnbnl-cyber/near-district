import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, partnerAppKeys, partnerEvents, partnerLinkCodes, type Db } from "@yielvy/db";
import { decryptJson, encryptJson } from "./crypto";
import { audit } from "./audit";
import { requireOrgRole } from "./authz";
import { badRequest, HttpError, notFound } from "./http";
import type { SessionUser } from "./session";

/**
 * Partner app events (Web2 companies): a company's backend tells Yielvy "this player did X in our app".
 *  - Consent: the player gets a one-time code on the hint and types it into the company's app; nothing else links them.
 *  - Authenticity: requests are signed with HMAC-SHA256(secret, `${timestamp}.${rawBody}`), 5-minute window.
 *  - Replay: event ids are unique per company.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_SKEW_MS = 5 * 60_000;

export async function createAppKey(db: Db, user: SessionUser, orgId: string, label: string) {
  await requireOrgRole(db, user, orgId, "admin");
  const keyId = `yk_${randomBytes(9).toString("hex")}`;
  const secret = `ys_${randomBytes(24).toString("base64url")}`;
  await db.insert(partnerAppKeys).values({ organizationId: orgId, keyId, secretCipher: encryptJson({ s: secret }), label: label.slice(0, 60), createdBy: user.userId });
  await audit(db, { actorUserId: user.userId, action: "partner_key.created", targetType: "organization", targetId: orgId, metadata: { keyId } });
  return { keyId, secret }; // the secret is shown once
}

export async function listAppKeys(db: Db, user: SessionUser, orgId: string) {
  await requireOrgRole(db, user, orgId, "admin");
  const rows = await db.select().from(partnerAppKeys).where(eq(partnerAppKeys.organizationId, orgId));
  return rows.map((r) => ({ keyId: r.keyId, label: r.label, createdAt: r.createdAt.toISOString(), revoked: Boolean(r.revokedAt) }));
}

export async function revokeAppKey(db: Db, user: SessionUser, orgId: string, keyId: string) {
  await requireOrgRole(db, user, orgId, "admin");
  const res = await db.update(partnerAppKeys).set({ revokedAt: new Date() }).where(and(eq(partnerAppKeys.organizationId, orgId), eq(partnerAppKeys.keyId, keyId))).returning();
  if (!res.length) throw notFound("Key not found.");
  await audit(db, { actorUserId: user.userId, action: "partner_key.revoked", targetType: "organization", targetId: orgId, metadata: { keyId } });
}

/** A short code the player enters in the company's app; valid 24h, one per request. */
export async function issueLinkCode(db: Db, user: SessionUser, orgId: string) {
  const bytes = randomBytes(8);
  const code = "YV-" + Array.from(bytes.subarray(0, 6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  const expiresAt = new Date(Date.now() + 24 * 3_600_000);
  await db.insert(partnerLinkCodes).values({ code, userId: user.userId, organizationId: orgId, expiresAt });
  return { code, expiresAt: expiresAt.toISOString() };
}

export function signEventBody(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Verifies a signed event and records it against the player who owns the code. */
export async function ingestPartnerEvent(db: Db, headers: Headers, rawBody: string) {
  const keyId = headers.get("x-yielvy-key") ?? "";
  const ts = headers.get("x-yielvy-timestamp") ?? "";
  const sig = headers.get("x-yielvy-signature") ?? "";
  if (!keyId || !ts || !/^[0-9a-f]{64}$/.test(sig)) throw new HttpError(401, "Missing or malformed signature headers.", "unauthenticated");
  const t = Number(ts) * 1000;
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > MAX_SKEW_MS) throw new HttpError(401, "Timestamp outside the allowed window.", "stale_request");
  const [key] = await db.select().from(partnerAppKeys).where(and(eq(partnerAppKeys.keyId, keyId), isNull(partnerAppKeys.revokedAt))).limit(1);
  if (!key) throw new HttpError(401, "Unknown or revoked key.", "unauthenticated");
  const expected = signEventBody(decryptJson<{ s: string }>(key.secretCipher).s, ts, rawBody);
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"))) throw new HttpError(401, "Bad signature.", "unauthenticated");

  let body: { code?: unknown; eventType?: unknown; eventId?: unknown };
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw badRequest("Expected a JSON body.");
  }
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const eventType = typeof body.eventType === "string" ? body.eventType : "";
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!/^YV-[A-Z0-9]{6}$/.test(code) || !/^[a-z0-9_.-]{2,40}$/.test(eventType) || !/^[\w.:-]{1,100}$/.test(eventId)) throw badRequest("Need code (YV-XXXXXX), eventType and eventId.");
  const [link] = await db
    .select()
    .from(partnerLinkCodes)
    .where(and(eq(partnerLinkCodes.code, code), eq(partnerLinkCodes.organizationId, key.organizationId), gt(partnerLinkCodes.expiresAt, new Date())))
    .limit(1);
  if (!link) throw notFound("That code isn't valid for your app (or it expired).");
  const [row] = await db.insert(partnerEvents).values({ organizationId: key.organizationId, userId: link.userId, eventType, eventId }).onConflictDoNothing().returning({ id: partnerEvents.id });
  return { accepted: true, duplicate: !row };
}
