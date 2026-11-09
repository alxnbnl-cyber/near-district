import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { requireCampaignAccess } from "@/server/authz";
import { deleteHint, saveHint } from "@/server/hints";
import { hintInput, type HintInput } from "@/lib/hint-schemas";

type Ctx = { params: Promise<{ id: string; hintId: string }> };

export const PATCH = route<Ctx>(
  async (req, { user, params }) => {
    const { id, hintId } = await params;
    const input = (await body(req, hintInput)) as HintInput;
    const database = await db();
    const { campaign } = await requireCampaignAccess(database, user!, id, "editor");
    return saveHint(database, user!, campaign, input, hintId);
  },
  { auth: "required" },
);

export const DELETE = route<Ctx>(
  async (_req, { user, params }) => {
    const { id, hintId } = await params;
    const database = await db();
    const { campaign } = await requireCampaignAccess(database, user!, id, "editor");
    await deleteHint(database, user!, campaign, hintId);
    return { ok: true };
  },
  { auth: "required" },
);
