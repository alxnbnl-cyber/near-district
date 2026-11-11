import { notFound, route } from "@/server/http";
import { getPublicCampaign } from "@/server/public";
import { getSessionUser } from "@/server/session";
import { trackView } from "@/server/analytics";
import { token } from "@/server/near";
import { demoEnabled, demoLogo } from "@/server/demo";

/** What the mission modal on the map needs. Only public fields; no rules internals or answers. */
export const GET = route<{ params: Promise<{ slug: string; campaign: string }> }>(async (_req, { params }) => {
  const p = await params;
  const d = await getPublicCampaign(p.slug, p.campaign);
  if (!d) throw notFound("This mission isn't available.");
  await trackView("campaign_view", d.space.id, d.campaign.id);
  const c = d.campaign;
  const user = await getSessionUser();
  return {
    campaign: { id: c.id, slug: c.slug, title: c.title, summary: c.summary, description: c.description, template: c.template, startsAt: c.startsAt, endsAt: c.endsAt },
    space: {
      name: d.space.name,
      slug: d.space.slug,
      logoUrl: d.space.logoUploadId ? `/api/uploads/${d.space.logoUploadId}` : demoEnabled() ? demoLogo(d.space.id) : null,
    },
    rules: {
      funded: d.rules.fundingSource !== "none" || Boolean(d.prize?.demo),
      winnersCount: d.rules.reward.winnersCount,
      equalShare: d.rules.reward.mode === "equal",
      claimWindowDays: d.rules.claimWindowDays,
      judgingCriteria: d.rules.judgingCriteria ?? null,
    },
    participants: d.participants,
    status: d.status,
    prize: d.prize,
    symbol: token().symbol,
    signedIn: Boolean(user),
  };
});
