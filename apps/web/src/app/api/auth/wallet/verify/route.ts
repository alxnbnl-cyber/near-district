import { z } from "zod";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { createSession } from "@/server/session";
import { verifyWalletLogin } from "@/server/external-wallets";

const input = z.object({
  chain: z.enum(["evm", "solana"]),
  nonce: z.string().regex(/^[0-9a-f]{48}$/),
  signature: z.string().min(64).max(200),
  walletApp: z.enum(["metamask", "rabby", "coinbase", "phantom", "solflare", "backpack", "injected"]).optional(),
});

/** Completes EVM / Solana wallet sign-in and starts a session. */
export const POST = route(async (req) => {
  const i = await body(req, input);
  const database = await db();
  const r = await verifyWalletLogin(database, i);
  await createSession(database, r.userId, { walletVerified: false });
  return { ok: true, address: r.address, created: r.created };
});
