import { z } from "zod";
import { body, HttpError, route } from "@/server/http";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { requireCampaignAccess, requireWalletStepUp } from "@/server/authz";
import { nearRpc, token } from "@/server/near";
import { rateLimit } from "@/server/rate-limit";
import { confirmDeposit, confirmRegister, planDeposit, planExit, planRegister } from "@/server/funding";

const uuid = z.string().uuid();
const intStr = z.string().regex(/^\d+$/);
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plan_register"), campaignId: uuid, maxOperatorReservePerPeriod: intStr, requireSponsorFinalize: z.boolean() }),
  z.object({ action: z.literal("confirm_register"), campaignId: uuid, txHash: z.string().max(50) }),
  // fixed prize only: every deposit is the prize itself
  z.object({ action: z.literal("plan_deposit"), campaignId: uuid, amount: z.string().max(30) }),
  z.object({ action: z.literal("confirm_deposit"), orderId: uuid, txHash: z.string().max(50) }),
  // after the mission: stop new reservations, then withdraw any unpaid prize
  z.object({ action: z.literal("plan_exit"), campaignId: uuid, step: z.enum(["wind_down", "withdraw"]), bonus: intStr.default("0") }),
]);

export const POST = route(
  async (req, { user }) => {
    const a = await body(req, input);
    const database = await db();
    await rateLimit(database, `funding:${user!.userId}`, 60, 600);
    const t = token();

    const vaultId = env().VAULT_CONTRACT_ID;
    if (!vaultId) throw new HttpError(503, "The vault contract isn't deployed on this network yet.", "vault_not_deployed");
    requireWalletStepUp(user!);
    const net = env().NEAR_NETWORK;
    switch (a.action) {
      case "plan_register": {
        const { campaign } = await requireCampaignAccess(database, user!, a.campaignId, "owner");
        const rules = campaign.draftRules as { reward?: { mode?: string } };
        void rules;
        return planRegister(user!, vaultId, { maxOperatorReservePerPeriod: BigInt(a.maxOperatorReservePerPeriod), requireSponsorFinalize: a.requireSponsorFinalize, randomEnabled: false });
      }
      case "confirm_register": {
        const { campaign } = await requireCampaignAccess(database, user!, a.campaignId, "owner");
        return confirmRegister(database, nearRpc(), net, vaultId, user!, campaign, a.txHash);
      }
      case "plan_deposit": {
        const { campaign } = await requireCampaignAccess(database, user!, a.campaignId, "owner");
        return planDeposit(database, user!, vaultId, t.contractId, t.decimals, campaign, "bonus", a.amount);
      }
      case "confirm_deposit":
        return confirmDeposit(database, nearRpc(), net, vaultId, user!, a.orderId, a.txHash);
      case "plan_exit": {
        const { campaign } = await requireCampaignAccess(database, user!, a.campaignId, "owner");
        return planExit(user!, vaultId, campaign, a.step, { principal: 0n, yield: 0n, bonus: BigInt(a.bonus) });
      }
    }
  },
  { auth: "required" },
);
