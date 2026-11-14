import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authChallenges } from "@near-district/db";
import { body, HttpError, route } from "@/server/http";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { ipHash } from "@/server/crypto";
import { rateLimit } from "@/server/rate-limit";
import { clientIp } from "@/server/session";

const input = z.object({ purpose: z.enum(["near_login", "link_wallet", "step_up"]) });

/** Issues a single-use NEP-413 challenge. The nonce is 32 random bytes, valid for 5 minutes. */
export const POST = route(async (req, { user }) => {
  const { purpose } = await body(req, input);
  if (purpose !== "near_login" && !user) throw new HttpError(401, "Please sign in first.");
  const database = await db();
  await rateLimit(database, `near-challenge:${ipHash(await clientIp()) ?? "unknown"}`, 30, 600);
  const nonce = randomBytes(32);
  const recipient = new URL(env().APP_URL).host;
  const message =
    purpose === "near_login"
      ? "Sign in to NEAR District"
      : purpose === "link_wallet"
        ? "Link this NEAR account to my NEAR District profile"
        : "Confirm it's me for a NEAR District funding action";
  await database.insert(authChallenges).values({
    nonce: nonce.toString("base64"),
    purpose,
    userId: user?.userId ?? null,
    recipient,
    message,
    expiresAt: new Date(Date.now() + 5 * 60_000),
  });
  return { nonce: nonce.toString("base64"), recipient, message, network: env().NEAR_NETWORK };
});
