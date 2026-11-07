import { z } from "zod";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { requireCampaignAccess } from "@/server/authz";
import { checkPublishable, updateCampaign } from "@/server/campaigns";
import { campaignDetailsInput } from "@/lib/campaign-schemas";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(
  async (_req, { user, params }) => {
    const { id } = await params;
    const database = await db();
    const { campaign } = await requireCampaignAccess(database, user!, id, "reviewer");
    return { campaign, publishCheck: campaign.status === "DRAFT" ? await checkPublishable(database, campaign) : null };
  },
  { auth: "required" },
);

export const PATCH = route<Ctx>(
  async (req, { user, params }) => {
    const { id } = await params;
    const input = await body(req, campaignDetailsInput.extend({ notice: z.string().max(500).optional() }));
    const database = await db();
    const { campaign } = await requireCampaignAccess(database, user!, id, "editor");
    const { notice, ...patch } = input;
    await updateCampaign(database, user!, campaign, patch, notice);
    return { ok: true };
  },
  { auth: "required" },
);
