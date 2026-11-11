import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@yielvy/db/testing";
import { eq, organizations, spaces, users, verifyInternal } from "@yielvy/db";
import { createSpace } from "./spaces";
import { createAppKey, ingestPartnerEvent, issueLinkCode, signEventBody } from "./partner-events";
import { HttpError } from "./http";
import type { SessionUser } from "./session";

let h: Awaited<ReturnType<typeof createTestDb>>;
const mkUser = async (name: string, wallet: string | null): Promise<SessionUser> => {
  const [u] = await h.db.insert(users).values({ displayName: name }).returning();
  return { sessionId: "s", userId: u!.id, displayName: name, email: null, status: "active", walletVerifiedAt: new Date(), payoutAccountId: wallet, adminRoles: [] };
};
const headers = (keyId: string, secret: string, body: string, ts = Math.floor(Date.now() / 1000).toString(), sig?: string) =>
  new Headers({ "x-yielvy-key": keyId, "x-yielvy-timestamp": ts, "x-yielvy-signature": sig ?? signEventBody(secret, ts, body) });

let owner: SessionUser, player: SessionUser, orgId: string, key: { keyId: string; secret: string }, code: string;

beforeAll(async () => {
  h = await createTestDb();
  owner = await mkUser("owner", "owner.testnet");
  player = await mkUser("player", null);
  const { space } = await createSpace(h.db, owner, { organizationName: "Acme", name: "Acme", slug: "acme", category: "project", tagline: "", description: "", socials: {}, buildingStyle: "tower" });
  await h.db.update(spaces).set({ moderation: "approved" }).where(eq(spaces.id, space.id));
  await h.db.update(organizations).set({ status: "approved" }).where(eq(organizations.id, space.organizationId));
  orgId = space.organizationId;
  key = await createAppKey(h.db, owner, orgId, "test");
  code = (await issueLinkCode(h.db, player, orgId)).code;
});
afterAll(async () => h?.close());

describe("partner app events", () => {
  const act = { type: "partner_api_event" as const, eventType: "signed_up", instructions: "Create an account" };

  it("a hint requirement isn't met before the app confirms", async () => {
    expect(await verifyInternal(h.db, player.userId, act, orgId)).toMatchObject({ ok: false, reason: "no_event_yet" });
  });

  it("accepts a correctly signed event for a valid code, once", async () => {
    const body = JSON.stringify({ code, eventType: "signed_up", eventId: "u-1" });
    expect(await ingestPartnerEvent(h.db, headers(key.keyId, key.secret, body), body)).toEqual({ accepted: true, duplicate: false });
    expect(await ingestPartnerEvent(h.db, headers(key.keyId, key.secret, body), body)).toEqual({ accepted: true, duplicate: true });
    expect(await verifyInternal(h.db, player.userId, act, orgId)).toMatchObject({ ok: true });
  });

  it("rejects bad signatures, stale timestamps and unknown codes", async () => {
    const body = JSON.stringify({ code, eventType: "first_trade", eventId: "u-2" });
    const reject = async (p: Promise<unknown>, status: number) => {
      await expect(p).rejects.toBeInstanceOf(HttpError);
      await p.catch((e: HttpError) => expect(e.status).toBe(status));
    };
    await reject(ingestPartnerEvent(h.db, headers(key.keyId, key.secret, body, undefined, "0".repeat(64)), body), 401);
    const old = (Math.floor(Date.now() / 1000) - 3600).toString();
    await reject(ingestPartnerEvent(h.db, headers(key.keyId, key.secret, body, old), body), 401);
    const badCode = JSON.stringify({ code: "YV-AAAAAA", eventType: "first_trade", eventId: "u-3" });
    await reject(ingestPartnerEvent(h.db, headers(key.keyId, key.secret, badCode), badCode), 404);
  });
});
