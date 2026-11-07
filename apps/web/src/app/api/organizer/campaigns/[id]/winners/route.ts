import { z } from "zod";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { requireCampaignAccess } from "@/server/authz";
import { selectWinners } from "@/server/contest";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(
  async (req, { user, params }) => {
    const { id } = await params;
    const { submissionIds } = await body(req, z.object({ submissionIds: z.array(z.string().uuid()).min(1).max(100) }));
    const database = await db();
    const { campaign } = await requireCampaignAccess(database, user!, id, "admin");
    await selectWinners(database, user!, campaign, submissionIds);
    return { ok: true };
  },
  { auth: "required" },
);
