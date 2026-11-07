import "server-only";
import { and, campaigns, eq, inArray, organizations, spaces, worldBuildings } from "@yielvy/db";
import { db } from "./db";
import type { ActivityFlag, WorldBuildingData, WorldData } from "@/world/types";

const NEW_WINDOW_MS = 14 * 86_400_000;
const ENDING_WINDOW_MS = 72 * 3_600_000;

/** Everything the public world needs, in one query pass. Only approved Spaces appear. */
export async function getWorldData(): Promise<WorldData> {
  const database = await db();
  const rows = await database
    .select({
      spaceId: spaces.id,
      slug: spaces.slug,
      name: spaces.name,
      tagline: spaces.tagline,
      category: spaces.category,
      style: spaces.buildingStyle,
      logoUploadId: spaces.logoUploadId,
      createdAt: spaces.createdAt,
      districtId: worldBuildings.districtId,
      plotIndex: worldBuildings.plotIndex,
    })
    .from(spaces)
    .innerJoin(worldBuildings, eq(worldBuildings.spaceId, spaces.id))
    .innerJoin(organizations, eq(organizations.id, spaces.organizationId))
    .where(and(eq(spaces.moderation, "approved"), eq(organizations.status, "approved")));

  const ids = rows.map((r) => r.spaceId);
  const camps = ids.length
    ? await database
        .select({
          spaceId: campaigns.spaceId,
          status: campaigns.status,
          template: campaigns.template,
          featured: campaigns.featured,
          endsAt: campaigns.endsAt,
        })
        .from(campaigns)
        .where(and(inArray(campaigns.spaceId, ids), inArray(campaigns.status, ["LIVE", "SCHEDULED"]), eq(campaigns.moderation, "approved")))
    : [];

  const now = Date.now();
  const buildings: WorldBuildingData[] = rows.map((r) => {
    const mine = camps.filter((c) => c.spaceId === r.spaceId);
    const live = mine.filter((c) => c.status === "LIVE");
    const flags: ActivityFlag[] = [];
    if (live.length) flags.push("live");
    if (live.some((c) => c.endsAt && c.endsAt.getTime() - now < ENDING_WINDOW_MS && c.endsAt.getTime() > now)) flags.push("ending_soon");
    if (mine.some((c) => c.featured)) flags.push("featured");
    if (now - r.createdAt.getTime() < NEW_WINDOW_MS) flags.push("new");
    return {
      spaceId: r.spaceId,
      slug: r.slug,
      name: r.name,
      tagline: r.tagline,
      category: r.category,
      districtId: r.districtId,
      plotIndex: r.plotIndex,
      style: r.style,
      logoUrl: r.logoUploadId ? `/api/uploads/${r.logoUploadId}` : null,
      flags,
      liveCampaigns: live.length,
      upcomingCampaigns: mine.filter((c) => c.status === "SCHEDULED").length,
      templates: [...new Set(live.map((c) => c.template))],
    };
  });
  return { buildings, generatedAt: new Date().toISOString() };
}
