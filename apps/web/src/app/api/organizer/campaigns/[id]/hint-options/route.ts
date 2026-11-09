import { route } from "@/server/http";
import { db } from "@/server/db";
import { requireCampaignAccess } from "@/server/authz";
import { builderOptions } from "@/server/hints";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(
  async (_req, { user, params }) => {
    const { id } = await params;
    const database = await db();
    const { campaign } = await requireCampaignAccess(database, user!, id, "editor");
    return builderOptions(database, campaign);
  },
  { auth: "required" },
);
