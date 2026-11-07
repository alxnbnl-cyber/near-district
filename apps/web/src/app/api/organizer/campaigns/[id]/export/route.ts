import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { db } from "@/server/db";
import { requireCampaignAccess } from "@/server/authz";
import { listSubmissions, toCsv } from "@/server/contest";
import { audit } from "@/server/audit";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(
  async (_req, { user, params }) => {
    const { id } = await params;
    const database = await db();
    const { campaign } = await requireCampaignAccess(database, user!, id, "reviewer");
    const csv = toCsv(await listSubmissions(database, campaign.id));
    await audit(database, { actorUserId: user!.userId, action: "contest.exported", targetType: "campaign", targetId: campaign.id });
    return new NextResponse(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${campaign.slug}-results.csv"` },
    });
  },
  { auth: "required" },
);
