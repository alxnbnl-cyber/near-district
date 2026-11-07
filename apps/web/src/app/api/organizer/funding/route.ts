import { z } from "zod";
import { body, HttpError, route } from "@/server/http";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { requireCampaignAccess, requireWalletStepUp } from "@/server/authz";
import { nearRpc, oneClick, token } from "@/server/near";
import { rateLimit } from "@/server/rate-limit";
import { confirmDeposit, confirmRegister, crossChainOrigins, planDeposit, planExit, planRegister, quoteCrossChain } from "@/server/funding";

const uuid = z.string().uuid();
const intStr = z.string().regex(/^\d+$/);
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("origins") }),
  z.object({ action: z.literal("quote"), campaignId: uuid, originAssetId: z.string().max(200), amount: intStr, refundTo: z.string().min(10).max(120), dry: z.boolean() }),
  z.object({ action: z.literal("plan_register"), campaignId: uuid, maxOperatorReservePerPeriod: intStr, requireSponsorFinalize: z.boolean() }),
  z.object({ action: z.literal("confirm_register"), campaignId: uuid, txHash: z.string().max(50) }),
  z.object({ action: z.literal("plan_deposit"), campaignId: uuid, kind: z.enum(["principal", "bonus"]), amount: z.string().max(30) }),
  z.object({ action: z.literal("confirm_deposit"), orderId: uuid, txHash: z.string().max(50) }),
  z.object({ action: z.literal("plan_exit"), campaignId: uuid, step: z.enum(["wind_down", "redeem", "withdraw"]), principal: intStr.default("0"), yield: intStr.default("0"), bonus: intStr.default("0") }),
]);

export const POST = route(
  async (req, { user }) => {
    const a = await body(req, input);
    const database = await db();
    await rateLimit(database, `funding:${user!.userId}`, 60, 600);
    const t = token();
    if (a.action === "origins") return crossChainOrigins(oneClick(), t.intentsAssetId);

    const vaultId = env().VAULT_CONTRACT_ID;
    if (a.action === "quote") {
      const { campaign } = await requireCampaignAccess(database, user!, a.campaignId, "admin");
      if (!a.dry) {
        if (!vaultId) throw new HttpError(503, "Funding opens once the vault is deployed. You can still preview a quote.", "vault_not_deployed");
        requireWalletStepUp(user!);
      }
      return quoteCrossChain(database, oneClick(), user!, campaign, { originAssetId: a.originAssetId, amount: BigInt(a.amount), refundTo: a.refundTo, destinationAssetId: t.intentsAssetId, tokenId: t.contractId, dry: a.dry });
    }
    if (!vaultId) throw new HttpError(503, "The vault contract isn't deployed on this network yet.", "vault_not_deployed");
    requireWalletStepUp(user!);
    const net = env().NEAR_NETWORK;
    switch (a.action) {
      case "plan_register": {
        const { campaign } = await requireCampaignAccess(database, user!, a.campaignId, "owner");
        const rules = campaign.draftRules as { reward?: { mode?: string } };
        return planRegister(user!, vaultId, { maxOperatorReservePerPeriod: BigInt(a.maxOperatorReservePerPeriod), requireSponsorFinalize: a.requireSponsorFinalize, randomEnabled: rules.reward?.mode === "random_draw" });
      }
      case "confirm_register": {
        const { campaign } = await requireCampaignAccess(database, user!, a.campaignId, "owner");
        return confirmRegister(database, nearRpc(), net, vaultId, user!, campaign, a.txHash);
      }
      case "plan_deposit": {
        const { campaign } = await requireCampaignAccess(database, user!, a.campaignId, "owner");
        return planDeposit(database, user!, vaultId, t.contractId, t.decimals, campaign, a.kind, a.amount);
      }
      case "confirm_deposit":
        return confirmDeposit(database, nearRpc(), net, vaultId, user!, a.orderId, a.txHash);
      case "plan_exit": {
        const { campaign } = await requireCampaignAccess(database, user!, a.campaignId, "owner");
        return planExit(user!, vaultId, campaign, a.step, { principal: BigInt(a.principal), yield: BigInt(a.yield), bonus: BigInt(a.bonus) });
      }
    }
  },
  { auth: "required" },
);
