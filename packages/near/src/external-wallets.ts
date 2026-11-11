/**
 * Ownership proofs for EVM and Solana wallets (used as payout destinations and for other-chain activity checks).
 * Pure functions; no I/O. Both verify a signature over the exact challenge message the server issued.
 *
 *   EVM:    personal_sign (EIP-191): keccak256("\x19Ethereum Signed Message:\n" + len + message), secp256k1, 65-byte r||s||v
 *   Solana: signMessage: ed25519 over the raw UTF-8 message bytes, public key = base58 address
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

export type ExternalChain = "evm" | "solana";

const enc = new TextEncoder();
const hexToBytes = (h: string) => {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  if (!/^[0-9a-fA-F]*$/.test(s) || s.length % 2) throw new Error("bad hex");
  return Uint8Array.from(s.match(/../g) ?? [], (b) => parseInt(b, 16));
};
const bytesToHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function base58Decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("bad base58");
    n = n * 58n + BigInt(i);
  }
  const out: number[] = [];
  while (n > 0n) {
    out.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const c of s) {
    if (c !== "1") break;
    out.unshift(0);
  }
  return Uint8Array.from(out);
}

export function isEvmAddress(a: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}
export function isSolanaAddress(a: string) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return false;
  try {
    return base58Decode(a).length === 32;
  } catch {
    return false;
  }
}

/** EIP-55 checksum form, for display and storage. */
export function toChecksumAddress(a: string): string {
  const lower = a.toLowerCase().replace(/^0x/, "");
  const hash = bytesToHex(keccak_256(enc.encode(lower)));
  return "0x" + Array.from(lower, (c, i) => (parseInt(hash[i]!, 16) >= 8 ? c.toUpperCase() : c)).join("");
}

export function evmPersonalMessageHash(message: string): Uint8Array {
  const m = enc.encode(message);
  return keccak_256(new Uint8Array([...enc.encode(`\x19Ethereum Signed Message:\n${m.length}`), ...m]));
}

/** Recovers the signer of an EIP-191 personal_sign signature; returns the checksummed address or null. */
export function recoverEvmSigner(message: string, signatureHex: string): string | null {
  try {
    const sig = hexToBytes(signatureHex);
    if (sig.length !== 65) return null;
    let v = sig[64]!;
    if (v >= 27) v -= 27;
    if (v !== 0 && v !== 1) return null;
    const recovered = new Uint8Array([v, ...sig.slice(0, 64)]);
    const pub = secp256k1.recoverPublicKey(recovered, evmPersonalMessageHash(message), { prehash: false });
    const uncompressed = secp256k1.Point.fromBytes(pub).toBytes(false);
    const addr = keccak_256(uncompressed.slice(1)).slice(-20);
    return toChecksumAddress("0x" + bytesToHex(addr));
  } catch {
    return null;
  }
}

export function verifyEvmSignature(address: string, message: string, signatureHex: string): boolean {
  const signer = recoverEvmSigner(message, signatureHex);
  return Boolean(signer && isEvmAddress(address) && signer.toLowerCase() === address.toLowerCase());
}

/** Solana signMessage: signature may be base58 or hex (wallets differ); 64 bytes either way. */
export function verifySolanaSignature(address: string, message: string, signature: string): boolean {
  try {
    if (!isSolanaAddress(address)) return false;
    const sig = /^(0x)?[0-9a-fA-F]{128}$/.test(signature) ? hexToBytes(signature) : base58Decode(signature);
    if (sig.length !== 64) return false;
    return ed25519.verify(sig, enc.encode(message), base58Decode(address));
  } catch {
    return false;
  }
}

export function verifyExternalSignature(chain: ExternalChain, address: string, message: string, signature: string): boolean {
  return chain === "evm" ? verifyEvmSignature(address, message, signature) : verifySolanaSignature(address, message, signature);
}
