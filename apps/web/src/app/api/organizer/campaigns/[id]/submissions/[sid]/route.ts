import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { requireCampaignAccess } from "@/server/authz";
import { reviewSubmission } from "@/server/contest";
import { reviewInput } from "@/lib/campaign-schemas";

type Ctx = { params: Promise<{ id: string; sid: string }> };

export const POST = route<Ctx>(
  async (req, { user, params }) => {
    const { id, sid } = await params;
    const input = await body(req, reviewInput);
    const database = await db();
    const { campaign } = await requireCampaignAccess(database, user!, id, "reviewer");
    return reviewSubmission(database, user!, campaign, sid, input);
  },
  { auth: "required" },
);
