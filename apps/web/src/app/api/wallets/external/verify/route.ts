import { z } from "zod";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { verifyExternalChallenge } from "@/server/external-wallets";

const input = z.object({
  chain: z.enum(["evm", "solana"]),
  nonce: z.string().regex(/^[0-9a-f]{48}$/),
  signature: z.string().min(64).max(200),
  walletApp: z.enum(["metamask", "rabby", "coinbase", "phantom", "solflare", "backpack", "injected"]).optional(),
});

export const POST = route(
  async (req, { user }) => {
    const i = await body(req, input);
    return verifyExternalChallenge(await db(), user!, i);
  },
  { auth: "required" },
);
