import { z } from "zod";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { issueExternalChallenge } from "@/server/external-wallets";

const input = z.object({ chain: z.enum(["evm", "solana"]), address: z.string().min(32).max(64) });

/** Issues a single-use message for an EVM or Solana wallet to sign (ownership proof, valid 10 minutes). */
export const POST = route(
  async (req, { user }) => {
    const { chain, address } = await body(req, input);
    const database = await db();
    await rateLimit(database, `ext-challenge:${user!.userId}`, 20, 600);
    return issueExternalChallenge(database, user!, chain, address);
  },
  { auth: "required" },
);
