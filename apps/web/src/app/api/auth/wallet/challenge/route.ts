import { z } from "zod";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { ipHash } from "@/server/crypto";
import { rateLimit } from "@/server/rate-limit";
import { clientIp } from "@/server/session";
import { issueWalletLoginChallenge } from "@/server/external-wallets";

const input = z.object({ chain: z.enum(["evm", "solana"]), address: z.string().min(32).max(64) });

/** Sign-in challenge for EVM / Solana wallets (single use, 10 minutes). */
export const POST = route(async (req) => {
  const { chain, address } = await body(req, input);
  const database = await db();
  await rateLimit(database, `wallet-login:${ipHash(await clientIp()) ?? "unknown"}`, 30, 600);
  return issueWalletLoginChallenge(database, chain, address);
});
