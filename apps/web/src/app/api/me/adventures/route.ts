import { and, campaigns, creativeSubmissions, desc, eq, participantEntries, qualifications, spaces } from "@yielvy/db";
import { route } from "@/server/http";
import { db } from "@/server/db";
import { effectiveStatus } from "@/server/campaigns";

/** The signed-in explorer's hunts and contest entries, for the map's My Adventures tab. */
export const GET = route(
  async (_req, { user }) => {
    const database = await db();
    const hunts = await database
      .select({ e: participantEntries, c: campaigns, space: spaces, q: qualifications })
      .from(participantEntries)
      .innerJoin(campaigns, eq(campaigns.id, participantEntries.campaignId))
      .innerJoin(spaces, eq(spaces.id, campaigns.spaceId))
      .leftJoin(qualifications, and(eq(qualifications.campaignId, campaigns.id), eq(qualifications.userId, participantEntries.userId)))
      .where(eq(participantEntries.userId, user!.userId))
      .orderBy(desc(participantEntries.startedAt))
      .limit(50);
    const entries = await database
      .select({ s: creativeSubmissions, c: campaigns, space: spaces })
      .from(creativeSubmissions)
      .innerJoin(campaigns, eq(campaigns.id, creativeSubmissions.campaignId))
      .innerJoin(spaces, eq(spaces.id, campaigns.spaceId))
      .where(eq(creativeSubmissions.userId, user!.userId))
      .orderBy(desc(creativeSubmissions.createdAt))
      .limit(50);
    const qual = (s: string | undefined) => (s === "qualified" ? "Qualified" : s === "held" ? "Under review" : s === "revoked" ? "Not eligible" : null);
    return {
      items: [
        ...hunts.map(({ e, c, space, q }) => ({
          id: e.id,
          template: "treasure_hunt" as const,
          title: c.title,
          spaceId: space.id,
          spaceName: space.name,
          href: `/explore?m=${space.slug}%2F${c.slug}`,
          campaignStatus: effectiveStatus(c as never),
          progress: e.status === "completed" ? `Finished · ${e.score} pts` : `Secret ${e.progress + 1} in progress`,
          badge: qual(q?.status) ?? (e.status === "completed" ? "Completed" : "In progress"),
          at: e.startedAt.toISOString(),
        })),
        ...entries.map(({ s, c, space }) => ({
          id: s.id,
          template: "creative_contest" as const,
          title: c.title,
          spaceId: space.id,
          spaceName: space.name,
          href: `/explore?m=${space.slug}%2F${c.slug}`,
          campaignStatus: effectiveStatus(c as never),
          progress: `Entry: “${s.title}”`,
          badge: s.status === "winner" ? "Winner" : s.status === "shortlisted" ? "Shortlisted" : s.status === "rejected" ? "Not selected" : "Submitted",
          at: s.createdAt.toISOString(),
        })),
      ].sort((a, b) => b.at.localeCompare(a.at)),
    };
  },
  { auth: "required" },
);
