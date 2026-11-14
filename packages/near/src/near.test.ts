import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import {
  harvestableYield,
  ledgerMovesForEvent,
  nep413Hash,
  parseVaultEvents,
  sharesToTokens,
  verifyAccountOwnership,
  verifyNep413Signature,
  withdrawableLiquidity,
  NearRpc,
  type RheaAsset,
} from "./index";

const asset: RheaAsset = {
  tokenId: "usdc",
  suppliedShares: 1_000_000n * 10n ** 18n,
  suppliedBalance: 1_100_000n * 10n ** 18n,
  borrowedBalance: 900_000n * 10n ** 18n,
  extraDecimals: 12,
  canDeposit: true,
  canWithdraw: true,
  supplyApr: "0.05",
  suppliedLimit: null,
};

describe("RHEA math (mirrors the vault contract)", () => {
  it("values shares and liquidity in token units", () => {
    const shares = 1_000n * 10n ** 18n; // 1000 shares at 1.1 => 1100 USDC
    expect(sharesToTokens(shares, asset)).toBe(1_100_000_000n);
    expect(withdrawableLiquidity(asset)).toBe(200_000_000_000n);
  });
  it("harvestable excludes principal and buffer", () => {
    const shares = 1_000n * 10n ** 18n;
    // value 1100.000000 - 1 unit - 1000 * 1.005
    expect(harvestableYield(shares, 1_000_000_000n, 50, asset)).toBe(1_100_000_000n - 1n - 1_005_000_000n);
    expect(harvestableYield(shares, 1_200_000_000n, 50, asset)).toBe(0n);
  });
});

describe("NEP-413", () => {
  const priv = ed25519.utils.randomSecretKey();
  const pub = `ed25519:${bs58.encode(ed25519.getPublicKey(priv))}`;
  const payload = { message: "Sign in to NEAR District", nonce: new Uint8Array(32).fill(9), recipient: "neardistrict.app" };
  const sig = Buffer.from(ed25519.sign(nep413Hash(payload), priv)).toString("base64");

  it("verifies a correctly signed payload", () => {
    expect(verifyNep413Signature(payload, pub, sig)).toBe(true);
  });
  it("rejects a changed nonce, message or recipient", () => {
    expect(verifyNep413Signature({ ...payload, nonce: new Uint8Array(32) }, pub, sig)).toBe(false);
    expect(verifyNep413Signature({ ...payload, message: "x" }, pub, sig)).toBe(false);
    expect(verifyNep413Signature({ ...payload, recipient: "evil.app" }, pub, sig)).toBe(false);
  });
  it("requires the key to be a FULL ACCESS key of the account", async () => {
    const fakeRpc = (permission: unknown) =>
      ({ viewAccessKey: async () => (permission === null ? null : { permission }) }) as unknown as NearRpc;
    expect(await verifyAccountOwnership(fakeRpc("FullAccess"), "alice.near", pub, sig, payload)).toEqual({ ok: true });
    expect((await verifyAccountOwnership(fakeRpc({ FunctionCall: {} }), "alice.near", pub, sig, payload)).ok).toBe(false);
    expect((await verifyAccountOwnership(fakeRpc(null), "alice.near", pub, sig, payload)).ok).toBe(false);
    expect((await verifyAccountOwnership(fakeRpc("FullAccess"), "Not Valid!", pub, sig, payload)).ok).toBe(false);
  });
});

describe("vault events -> ledger", () => {
  it("parses only prize-vault events and keeps the books balanced", () => {
    const logs = [
      'EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"amount":"5"}]}',
      'EVENT_JSON:{"standard":"near_district_prize_vault","version":"1.0.0","event":"reward_paid","data":[{"mission_id":"1","account_id":"a.testnet","amount":"1000","index":0}]}',
      "not an event",
      'EVENT_JSON:{"standard":"near_district_prize_vault","event":"broken"',
    ];
    const ev = parseVaultEvents(logs);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.data.index).toBe("0");
    const moves = ledgerMovesForEvent(ev[0]!);
    expect(moves.reduce((s, m) => s + m.delta, 0n)).toBe(0n);
  });
  it("funding locks the prize and a refund releases it to the project", () => {
    expect(ledgerMovesForEvent({ event: "prize_funded", data: { amount: "300" } })).toEqual([{ bucket: "bonus_available", delta: 300n }]);
    expect(ledgerMovesForEvent({ event: "refund_sent", data: { amount: "1" } })).toEqual([
      { bucket: "bonus_available", delta: -1n },
      { bucket: "withdrawn", delta: 1n },
    ]);
  });
});
