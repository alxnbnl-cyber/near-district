import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { requireCampaignAccess } from "@/server/authz";
import { checkPublishable, currentRules, defaultRules, effectiveStatus, listQuestions } from "@/server/campaigns";
import { listSubmissions } from "@/server/contest";
import { token } from "@/server/near";
import { serialize } from "@/server/http";
import { CampaignEditor } from "./CampaignEditor";

export const metadata = { title: "Edit campaign" };

export default async function CampaignEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/signin?next=/organizer/campaigns/${id}`);
  const database = await db();
  const { campaign, space, role } = await requireCampaignAccess(database, user, id, "reviewer");
  const draft = campaign.status === "DRAFT" || campaign.status === "PENDING_FUNDING";
  const [questions, check, rules, submissions] = await Promise.all([
    campaign.template === "treasure_hunt" ? listQuestions(database, id) : Promise.resolve([]),
    draft ? checkPublishable(database, campaign) : Promise.resolve(null),
    draft
      ? Promise.resolve({ ...defaultRules(campaign.template as "treasure_hunt"), ...(campaign.draftRules as object) })
      : currentRules(database, campaign),
    campaign.template === "creative_contest" && !draft ? listSubmissions(database, id) : Promise.resolve([]),
  ]);
  const t = token();
  return (
    <CampaignEditor
      initial={
        serialize({
          campaign: { ...campaign, effective: effectiveStatus(campaign as never) },
          spaceSlug: space.slug,
          role,
          questions,
          check,
          rules,
          submissions: submissions.map((s) => ({ ...s, history: undefined })),
          token: { symbol: t.symbol, decimals: t.decimals },
        }) as never
      }
    />
  );
}
