import { z } from "zod";
import { badRequest, body, route } from "@/server/http";
import { db } from "@/server/db";
import { network } from "@/server/near";
import { rateLimit } from "@/server/rate-limit";
import { audit } from "@/server/audit";
import { fmt, offrampMode, verifiedWallets, verifyOfframpTransfer } from "@/server/offramp";

const input = z.object({ txHash: z.string().min(40).max(60) });

/**
 * Testnet cash-out: verifies the player's on-chain transfer to the offramp account. The bank payout after this is
 * simulated (no fiat exists on testnet) and the response says so.
 */
export const POST = route(
  async (req, { user }) => {
    if (offrampMode() !== "testnet") throw badRequest("On-chain cash-out isn't enabled on this deployment.");
    const { txHash } = await body(req, input);
    const database = await db();
    await rateLimit(database, `offramp:${user!.userId}`, 20, 3600);
    const wallets = await verifiedWallets(database, user!.userId);
    if (!wallets.length) throw badRequest("Link and verify a NEAR wallet first.");
    const r = await verifyOfframpTransfer(txHash, wallets);
    if (!r.ok) return { verified: false, reason: r.reason };
    await audit(database, { actorUserId: user!.userId, action: "offramp.testnet_transfer_verified", targetType: "tx", targetId: txHash, metadata: { from: r.from, amount: r.amount.toString() } });
    return { verified: true, amount: fmt(r.amount), txUrl: network().explorerTxUrl(txHash), payout: "simulated" };
  },
  { auth: "required" },
);
