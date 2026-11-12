import { and, campaigns, count, desc, eq, inArray, ne, organizations, participantEntries, spaces } from "@yielvy/db";

import { notFound, route } from "@/server/http";
import { db } from "@/server/db";
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
  const s = d.space;
  const user = await getSessionUser();
  const database = await db();
  const others = await database
    .select({ title: campaigns.title, slug: campaigns.slug, template: campaigns.template, status: campaigns.status, endsAt: campaigns.endsAt })
    .from(campaigns)
    .where(and(eq(campaigns.spaceId, s.id), ne(campaigns.id, c.id), eq(campaigns.moderation, "approved"), inArray(campaigns.status, ["LIVE", "SCHEDULED"])))
    .orderBy(desc(campaigns.publishedAt))
    .limit(6);
  const [{ players } = { players: 0 }] = await database
    .select({ players: count() })
    .from(participantEntries)
    .innerJoin(campaigns, eq(campaigns.id, participantEntries.campaignId))
    .where(eq(campaigns.spaceId, s.id));
  const [myEntry] = user ? await database.select({ demoEndedAt: participantEntries.demoEndedAt }).from(participantEntries).where(and(eq(participantEntries.campaignId, c.id), eq(participantEntries.userId, user.userId))).limit(1) : [];
  const [org] = await database.select({ status: organizations.status }).from(organizations).innerJoin(spaces, eq(spaces.organizationId, organizations.id)).where(eq(spaces.id, s.id)).limit(1);
  return {
    campaign: { id: c.id, slug: c.slug, title: c.title, summary: c.summary, description: c.description, template: c.template, startsAt: c.startsAt, endsAt: c.endsAt },
    space: {
      name: s.name,
      slug: s.slug,
      tagline: s.tagline,
      description: s.description,
      category: s.category,
      websiteUrl: s.websiteUrl,
      socials: (s.socials ?? {}) as Record<string, string>,
      logoUrl: s.logoUploadId ? `/api/uploads/${s.logoUploadId}` : demoEnabled() ? demoLogo(s.id) : null,
      otherMissions: others,
      verified: org?.status === "approved",
      joinedAt: s.createdAt,
      stats: { missions: others.length + 1, players },
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
    /** Local demo mode: shows the simulate buttons. */
    demo: demoEnabled(),
    /** Demo: whether this player joined, and fast-forwarded to the deadline for themselves. */
    me: { joined: Boolean(myEntry), demoEnded: Boolean(myEntry?.demoEndedAt) },
  };
});
