import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { createTestDb } from "@yielvy/db/testing";
import { eq, users } from "@yielvy/db";
import { evmPersonalMessageHash, toChecksumAddress } from "@yielvy/near";
import { issueWalletLoginChallenge, verifyWalletLogin } from "./external-wallets";

let h: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  process.env.APP_URL ??= "http://localhost:3000";
  h = await createTestDb();
});
afterAll(async () => h?.close());

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const b58 = (bytes: Uint8Array) => {
  let n = BigInt("0x" + hex(bytes));
  let s = "";
  while (n > 0n) {
    s = B58[Number(n % 58n)] + s;
    n /= 58n;
  }
  return s;
};

describe("sign in with an EVM wallet", () => {
  const sk = secp256k1.utils.randomSecretKey();
  const address = toChecksumAddress("0x" + hex(keccak_256(secp256k1.getPublicKey(sk, false).slice(1)).slice(-20)));
  const sign = (message: string) => {
    const rec = secp256k1.sign(evmPersonalMessageHash(message), sk, { prehash: false, format: "recovered" });
    return "0x" + hex(new Uint8Array([...rec.slice(1), rec[0]! + 27]));
  };

  it("creates a profile on first sign-in with Base as the prize destination", async () => {
    const ch = await issueWalletLoginChallenge(h.db, "evm", address.toLowerCase());
    const r = await verifyWalletLogin(h.db, { chain: "evm", nonce: ch.nonce, signature: sign(ch.message) });
    expect(r).toMatchObject({ address, created: true });
    const [u] = await h.db.select().from(users).where(eq(users.id, r.userId));
    expect(u!.payoutDestination).toEqual({ kind: "evm", chain: "base", address });
  });

  it("signs the same wallet back into the same profile; challenges are single use", async () => {
    const ch = await issueWalletLoginChallenge(h.db, "evm", address);
    const sig = sign(ch.message);
    const r = await verifyWalletLogin(h.db, { chain: "evm", nonce: ch.nonce, signature: sig });
    expect(r.created).toBe(false);
    await expect(verifyWalletLogin(h.db, { chain: "evm", nonce: ch.nonce, signature: sig })).rejects.toThrow(/expired/);
  });

  it("rejects a signature from another key", async () => {
    const ch = await issueWalletLoginChallenge(h.db, "evm", address);
    const other = secp256k1.utils.randomSecretKey();
    const rec = secp256k1.sign(evmPersonalMessageHash(ch.message), other, { prehash: false, format: "recovered" });
    await expect(verifyWalletLogin(h.db, { chain: "evm", nonce: ch.nonce, signature: "0x" + hex(new Uint8Array([...rec.slice(1), rec[0]! + 27])) })).rejects.toThrow(/doesn't match/);
  });
});

describe("sign in with a Solana wallet", () => {
  it("creates a profile with Solana as the prize destination", async () => {
    const sk = ed25519.utils.randomSecretKey();
    const address = b58(ed25519.getPublicKey(sk));
    const ch = await issueWalletLoginChallenge(h.db, "solana", address);
    const r = await verifyWalletLogin(h.db, { chain: "solana", nonce: ch.nonce, signature: hex(ed25519.sign(new TextEncoder().encode(ch.message), sk)) });
    expect(r.created).toBe(true);
    const [u] = await h.db.select().from(users).where(eq(users.id, r.userId));
    expect(u!.payoutDestination).toEqual({ kind: "solana", address });
  });
});
