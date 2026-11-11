import { campaigns, desc, eq, rewardAllocations, rewardClaims, rewardPeriods, spaces } from "@yielvy/db";
import { formatDisplay } from "@yielvy/core";
import { route } from "@/server/http";
import { db } from "@/server/db";
import { network, token } from "@/server/near";
import { env } from "@/server/env";

/** The signed-in explorer's won rewards, for the map's Progress panel (same rules as /me/rewards). */
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
    const now = new Date();
    const vault = Boolean(env().VAULT_CONTRACT_ID);
    return {
      symbol: t.symbol,
      hasWallet: Boolean(user!.payoutAccountId),
      items: rows.map(({ a, p, c, space, claim }) => {
        const open = p.state === "CLAIMABLE" && p.claimableAfter && p.claimableAfter <= now && p.claimDeadline && p.claimDeadline > now;
        const expired = Boolean(p.claimDeadline && p.claimDeadline <= now && claim?.state !== "CONFIRMED");
        const state = claim?.state === "CONFIRMED" ? "claimed" : expired ? "expired" : open && vault ? "claimable" : "pending";
        return {
          id: a.id,
          title: c.title,
          spaceName: space.name,
          amount: formatDisplay(a.amount, t.decimals),
          state,
          claimPending: claim?.state === "SUBMITTED",
          claimableFrom: p.claimableAfter && p.claimableAfter > now ? p.claimableAfter.toISOString() : null,
          txUrl: claim?.txHash ? net.explorerTxUrl(claim.txHash) : null,
        };
      }),
    };
  },
  { auth: "required" },
);
