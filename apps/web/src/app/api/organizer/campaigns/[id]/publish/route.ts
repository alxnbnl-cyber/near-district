import { route } from "@/server/http";
import { db } from "@/server/db";
import { requireCampaignAccess } from "@/server/authz";
import { publishCampaign } from "@/server/campaigns";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(
  async (_req, { user, params }) => {
    const { id } = await params;
    const database = await db();
    const { campaign } = await requireCampaignAccess(database, user!, id, "admin");
    return publishCampaign(database, user!, campaign);
  },
  { auth: "required" },
);
