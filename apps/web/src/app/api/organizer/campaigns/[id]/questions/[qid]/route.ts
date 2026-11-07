import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { requireCampaignAccess } from "@/server/authz";
import { deleteQuestion, updateQuestion } from "@/server/campaigns";
import { questionInput } from "@/lib/campaign-schemas";

type Ctx = { params: Promise<{ id: string; qid: string }> };

export const PUT = route<Ctx>(
  async (req, { user, params }) => {
    const { id, qid } = await params;
    const q = await body(req, questionInput);
    const database = await db();
    const { campaign } = await requireCampaignAccess(database, user!, id, "editor");
    await updateQuestion(database, user!, campaign, qid, q);
    return { ok: true };
  },
  { auth: "required" },
);

export const DELETE = route<Ctx>(
  async (_req, { user, params }) => {
    const { id, qid } = await params;
    const database = await db();
    const { campaign } = await requireCampaignAccess(database, user!, id, "editor");
    await deleteQuestion(database, user!, campaign, qid);
    return { ok: true };
  },
  { auth: "required" },
);
