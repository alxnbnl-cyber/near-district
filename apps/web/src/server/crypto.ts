import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { env } from "./env";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(s: string | Uint8Array): string {
  return createHash("sha256").update(s).digest("hex");
}

export function hmacHex(key: string, s: string): string {
  return createHmac("sha256", key).update(s).digest("hex");
}

/** Irreversible IP fingerprint for abuse controls; never store raw IPs. */
export function ipHash(ip: string | null): string | null {
  if (!ip) return null;
  return hmacHex(env().IP_HASH_SALT, ip).slice(0, 32);
}

/** Rotates daily so analytics visitors cannot be tracked across days. */
export function dailyVisitorHash(ip: string | null, ua: string | null, day: string): string {
  return hmacHex(env().IP_HASH_SALT, `${day}|${ip ?? ""}|${ua ?? ""}`).slice(0, 24);
}

function key(): Buffer {
  return Buffer.from(env().ANSWER_ENCRYPTION_KEY, "hex");
}

/** AES-256-GCM. Output: base64url(iv | tag | ciphertext). */
export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64url");
}

export function decryptJson<T>(blob: string): T {
  const buf = Buffer.from(blob, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString("utf8")) as T;
}
