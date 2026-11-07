import { z } from "zod";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { requireCampaignAccess } from "@/server/authz";
import { setCampaignState } from "@/server/campaigns";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(
  async (req, { user, params }) => {
    const { id } = await params;
    const { to } = await body(req, z.object({ to: z.enum(["PAUSED", "LIVE", "ENDED"]) }));
    const database = await db();
    const { campaign } = await requireCampaignAccess(database, user!, id, "admin");
    await setCampaignState(database, user!, campaign, to);
    return { ok: true };
  },
  { auth: "required" },
);
