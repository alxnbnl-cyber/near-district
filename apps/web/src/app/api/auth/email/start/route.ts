import { z } from "zod";
import { emailLoginTokens } from "@yielvy/db";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { ipHash, randomToken, sha256Hex } from "@/server/crypto";
import { rateLimit } from "@/server/rate-limit";
import { clientIp } from "@/server/session";
import { sendEmail } from "@/server/email";

const input = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254) });

export const POST = route(async (req) => {
  const { email } = await body(req, input);
  const database = await db();
  const ip = ipHash(await clientIp()) ?? "unknown";
  await rateLimit(database, `email-start:ip:${ip}`, 10, 3600);
  await rateLimit(database, `email-start:addr:${sha256Hex(email)}`, 4, 3600);
  const token = randomToken(32);
  await database.insert(emailLoginTokens).values({
    tokenHash: sha256Hex(token),
    email,
    expiresAt: new Date(Date.now() + 15 * 60_000),
  });
  const link = `${env().APP_URL}/signin/verify#token=${token}`;
  await sendEmail(
    email,
    "Your Yielvy sign-in link",
    `Open this link to sign in to Yielvy. It expires in 15 minutes and works once.\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
  );
  // Same response whether or not the address has an account.
  return { ok: true };
});
