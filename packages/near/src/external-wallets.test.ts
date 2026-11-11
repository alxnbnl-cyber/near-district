import { describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { base58Decode, evmPersonalMessageHash, isSolanaAddress, recoverEvmSigner, toChecksumAddress, verifyEvmSignature, verifySolanaSignature } from "./external-wallets";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58(bytes: Uint8Array) {
  let n = BigInt("0x" + (hex(bytes) || "0"));
  let s = "";
  while (n > 0n) {
    s = B58[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = "1" + s;
  }
  return s;
}

describe("EVM personal_sign", () => {
  const sk = secp256k1.utils.randomSecretKey();
  const pub = secp256k1.getPublicKey(sk, false);
  const address = toChecksumAddress("0x" + hex(keccak_256(pub.slice(1)).slice(-20)));
  const message = "Yielvy wants you to prove this wallet.\nNonce: abc";
  const rec = secp256k1.sign(evmPersonalMessageHash(message), sk, { prehash: false, format: "recovered" });
  const sig = "0x" + hex(new Uint8Array([...rec.slice(1), rec[0]! + 27]));

  it("recovers the signer and verifies", () => {
    expect(recoverEvmSigner(message, sig)).toBe(address);
    expect(verifyEvmSignature(address.toLowerCase(), message, sig)).toBe(true);
  });
  it("rejects another message or address", () => {
    expect(verifyEvmSignature(address, message + "x", sig)).toBe(false);
    expect(verifyEvmSignature("0x" + "1".repeat(40), message, sig)).toBe(false);
    expect(verifyEvmSignature(address, message, "0x1234")).toBe(false);
  });
  it("checksums addresses (EIP-55 vector)", () => {
    expect(toChecksumAddress("0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359")).toBe("0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359");
  });
});

describe("Solana signMessage", () => {
  const sk = ed25519.utils.randomSecretKey();
  const address = b58(ed25519.getPublicKey(sk));
  const message = "Yielvy wants you to prove this wallet.\nNonce: xyz";
  const sig = ed25519.sign(new TextEncoder().encode(message), sk);

  it("verifies base58 and hex signatures", () => {
    expect(isSolanaAddress(address)).toBe(true);
    expect(base58Decode(address)).toHaveLength(32);
    expect(verifySolanaSignature(address, message, b58(sig))).toBe(true);
    expect(verifySolanaSignature(address, message, hex(sig))).toBe(true);
  });
  it("rejects tampering", () => {
    expect(verifySolanaSignature(address, message + "!", b58(sig))).toBe(false);
    expect(verifySolanaSignature("11111111111111111111111111111111", message, b58(sig))).toBe(false);
  });
});
