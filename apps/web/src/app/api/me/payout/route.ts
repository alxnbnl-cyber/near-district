import { z } from "zod";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { EVM_PAYOUT_CHAINS, listExternalWallets, setPayoutDestination } from "@/server/external-wallets";

const input = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("near") }),
  z.object({ kind: z.literal("evm"), chain: z.enum(EVM_PAYOUT_CHAINS), address: z.string() }),
  z.object({ kind: z.literal("solana"), address: z.string() }),
]);

/** Linked EVM/Solana wallets and where the player wants prizes paid. */
export const GET = route(async (_req, { user }) => listExternalWallets(await db(), user!.userId), { auth: "required" });

export const PUT = route(
  async (req, { user }) => {
    const dest = await body(req, input);
    return { payout: await setPayoutDestination(await db(), user!, dest) };
  },
  { auth: "required" },
);
