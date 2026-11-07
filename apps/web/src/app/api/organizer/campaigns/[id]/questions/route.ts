import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { requireCampaignAccess } from "@/server/authz";
import { addQuestion, listQuestions } from "@/server/campaigns";
import { questionInput } from "@/lib/campaign-schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Organizer view of questions. Answer rules are write-only and never returned. */
export const GET = route<Ctx>(
  async (_req, { user, params }) => {
    const { id } = await params;
    const database = await db();
    await requireCampaignAccess(database, user!, id, "editor");
    return listQuestions(database, id);
  },
  { auth: "required" },
);

export const POST = route<Ctx>(
  async (req, { user, params }) => {
    const { id } = await params;
    const q = await body(req, questionInput);
    const database = await db();
    const { campaign } = await requireCampaignAccess(database, user!, id, "editor");
    const row = await addQuestion(database, user!, campaign, q);
    return { id: row.id };
  },
  { auth: "required" },
);
