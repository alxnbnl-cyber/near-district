import { campaigns, desc, eq, rewardAllocations, rewardClaims, rewardPeriods, spaces } from "@near-district/db";
import { formatDisplay } from "@near-district/core";
import { route } from "@/server/http";
import { db } from "@/server/db";
import { network, token } from "@/server/near";

const realTx = (h: string | null | undefined) => Boolean(h && /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(h));

/**
 * The signed-in explorer's won rewards, for the map's Progress panel (same rules as /me/rewards).
 * Prizes are paid automatically by the prize vault, so there is nothing to claim:
 *   paid       on-chain payout confirmed (links to the transaction)
 *   demo_paid  recorded by the per-player demo simulation; no funds moved
 *   retrying   the transfer failed (usually an unregistered wallet) and is being retried
 *   pending    waiting for the deadline / payout
 */
export const GET = route(
  async (_req, { user }) => {
    const database = await db();
    const rows = await database
      .select({ a: rewardAllocations, p: rewardPeriods, c: campaigns, space: spaces, claim: rewardClaims })
      .from(rewardAllocations)
      .innerJoin(rewardPeriods, eq(rewardPeriods.id, rewardAllocations.rewardPeriodId))
      .innerJoin(campaigns, eq(campaigns.id, rewardPeriods.campaignId))
      .innerJoin(spaces, eq(spaces.id, campaigns.spaceId))
      .leftJoin(rewardClaims, eq(rewardClaims.allocationId, rewardAllocations.id))
      .where(eq(rewardAllocations.userId, user!.userId))
      .orderBy(desc(rewardAllocations.createdAt))
      .limit(50);
    const t = token();
    const net = network();
    return {
      symbol: t.symbol,
      hasWallet: Boolean(user!.payoutAccountId),
      items: rows.map(({ a, p, c, space, claim }) => {
        const state = claim?.state === "CONFIRMED" ? (realTx(claim.txHash) ? "paid" : "demo_paid") : claim?.state === "FAILED" ? "retrying" : "pending";
        return {
          id: a.id,
          title: c.title,
          spaceName: space.name,
          amount: formatDisplay(a.amount, t.decimals),
          state,
          paysAfter: p.endsAt.toISOString(),
          txUrl: realTx(claim?.txHash) ? net.explorerTxUrl(claim!.txHash!) : null,
        };
      }),
    };
  },
  { auth: "required" },
);
