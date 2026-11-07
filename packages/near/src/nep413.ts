/**
 * NEP-413 off-chain message signature verification (wallet sign-in / wallet linking).
 *
 * Proof of ownership requires ALL of:
 *   1. the nonce was issued by us, unexpired and unused (checked by the caller against the DB),
 *   2. the ed25519 signature is valid over sha256(borsh(tag) || borsh(payload)),
 *   3. the public key is a FULL ACCESS key of the claimed account, verified via RPC at final finality.
 * A submitted account id alone is never treated as proof.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import bs58 from "bs58";
import type { NearRpc } from "./rpc";

export const NEP413_TAG = 2 ** 31 + 413;

export interface Nep413Payload {
  message: string;
  nonce: Uint8Array; // 32 bytes
  recipient: string;
  callbackUrl?: string | null;
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}
function borshString(s: string): Uint8Array {
  const bytes = utf8ToBytes(s);
  return concat(u32le(bytes.length), bytes);
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function nep413Hash(p: Nep413Payload): Uint8Array {
  if (p.nonce.length !== 32) throw new Error("NEP-413 nonce must be 32 bytes");
  const cb = p.callbackUrl == null ? new Uint8Array([0]) : concat(new Uint8Array([1]), borshString(p.callbackUrl));
  return sha256(concat(u32le(NEP413_TAG), borshString(p.message), p.nonce, borshString(p.recipient), cb));
}

export function parseEd25519PublicKey(pk: string): Uint8Array {
  const [curve, data] = pk.split(":");
  if (curve !== "ed25519" || !data) throw new Error("Only ed25519 keys are supported");
  const bytes = bs58.decode(data);
  if (bytes.length !== 32) throw new Error("Invalid ed25519 public key");
  return bytes;
}

export function decodeSignature(sig: string): Uint8Array {
  // Wallets return base64 (NEP-413 reference) — accept "ed25519:<base58>" too.
  if (sig.startsWith("ed25519:")) return bs58.decode(sig.slice(8));
  return Uint8Array.from(Buffer.from(sig, "base64"));
}

export function verifyNep413Signature(p: Nep413Payload, publicKey: string, signature: string): boolean {
  try {
    const sig = decodeSignature(signature);
    if (sig.length !== 64) return false;
    return ed25519.verify(sig, nep413Hash(p), parseEd25519PublicKey(publicKey));
  } catch {
    return false;
  }
}

export type OwnershipResult = { ok: true } | { ok: false; reason: string };

export async function verifyAccountOwnership(
  rpc: NearRpc,
  accountId: string,
  publicKey: string,
  signature: string,
  payload: Nep413Payload,
): Promise<OwnershipResult> {
  if (!/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(accountId) || accountId.length < 2 || accountId.length > 64) {
    return { ok: false, reason: "Invalid NEAR account id" };
  }
  if (!verifyNep413Signature(payload, publicKey, signature)) return { ok: false, reason: "Signature does not match" };
  const key = await rpc.viewAccessKey(accountId, publicKey);
  if (!key) return { ok: false, reason: "Key is not registered on this account" };
  if (key.permission !== "FullAccess") return { ok: false, reason: "Key is not a full-access key" };
  return { ok: true };
}
