import { z } from "zod";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { requireCampaignAccess } from "@/server/authz";
import { reorderQuestions } from "@/server/campaigns";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route<Ctx>(
  async (req, { user, params }) => {
    const { id } = await params;
    const { order } = await body(req, z.object({ order: z.array(z.string().uuid()).max(50) }));
    const database = await db();
    const { campaign } = await requireCampaignAccess(database, user!, id, "editor");
    await reorderQuestions(database, user!, campaign, order);
    return { ok: true };
  },
  { auth: "required" },
);
