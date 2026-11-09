import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { requireCampaignAccess } from "@/server/authz";
import { listHints, saveHint } from "@/server/hints";
import { hintInput, type HintInput } from "@/lib/hint-schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Organizer-only: full hint definitions including the secret clue. */
export const GET = route<Ctx>(
  async (_req, { user, params }) => {
    const { id } = await params;
    const database = await db();
    await requireCampaignAccess(database, user!, id, "editor");
    return listHints(database, id);
  },
  { auth: "required" },
);

export const POST = route<Ctx>(
  async (req, { user, params }) => {
    const { id } = await params;
    const input = (await body(req, hintInput)) as HintInput;
    const database = await db();
    const { campaign } = await requireCampaignAccess(database, user!, id, "editor");
    return saveHint(database, user!, campaign, input);
  },
  { auth: "required" },
);
