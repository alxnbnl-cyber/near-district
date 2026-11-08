import "server-only";
import { and, campaigns, campaignVersions, eq, inArray, organizations, spaces, worldBuildings } from "@yielvy/db";
import { lotPosition, type DistrictId } from "@yielvy/core/world";
import type { CampaignRules } from "@yielvy/core";
import { db } from "./db";
import { effectiveStatus } from "./campaigns";
import type { ActivityFlag, FeaturedCampaign, MarkerKind, WorldBuildingData, WorldData } from "@/world/types";

const NEW_WINDOW_MS = 14 * 86_400_000;
const ENDING_WINDOW_MS = 72 * 3_600_000;

/** Everything the public map needs. Only approved Spaces and approved, published campaigns appear. */
export async function getWorldData(): Promise<WorldData> {
  const database = await db();
  const rows = await database
    .select({
      spaceId: spaces.id,
      slug: spaces.slug,
      name: spaces.name,
      tagline: spaces.tagline,
      category: spaces.category,
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
        .select({ c: campaigns, rules: campaignVersions.rules })
        .from(campaigns)
        .leftJoin(campaignVersions, and(eq(campaignVersions.campaignId, campaigns.id), eq(campaignVersions.version, campaigns.currentVersion)))
        .where(and(inArray(campaigns.spaceId, ids), inArray(campaigns.status, ["LIVE", "SCHEDULED"]), eq(campaigns.moderation, "approved")))
    : [];

  const now = Date.now();
  const buildings: WorldBuildingData[] = rows.map((r) => {
    const mine = camps
      .map((x) => ({ ...x, eff: effectiveStatus(x.c as never) }))
      .filter((x) => x.eff === "LIVE" || x.eff === "SCHEDULED");
    const own = mine.filter((x) => x.c.spaceId === r.spaceId);
    const live = own.filter((x) => x.eff === "LIVE");
    const upcoming = own.filter((x) => x.eff === "SCHEDULED");
    const flags: ActivityFlag[] = [];
    if (live.length) flags.push("live");
    if (live.some((x) => x.c.endsAt && x.c.endsAt.getTime() - now < ENDING_WINDOW_MS)) flags.push("ending_soon");
    if (own.some((x) => x.c.featured)) flags.push("featured");
    if (now - r.createdAt.getTime() < NEW_WINDOW_MS) flags.push("new");
    const kind: MarkerKind = live.some((x) => x.c.template === "treasure_hunt")
      ? "hunt"
      : live.some((x) => x.c.template === "creative_contest")
        ? "contest"
        : upcoming.length
          ? "upcoming"
          : "space";
    const pick =
      live.find((x) => x.c.featured) ??
      [...live].sort((a, b) => (a.c.endsAt?.getTime() ?? Infinity) - (b.c.endsAt?.getTime() ?? Infinity))[0] ??
      [...upcoming].sort((a, b) => (a.c.startsAt?.getTime() ?? 0) - (b.c.startsAt?.getTime() ?? 0))[0];
    const featured: FeaturedCampaign | null = pick
      ? {
          title: pick.c.title,
          slug: pick.c.slug,
          template: pick.c.template as FeaturedCampaign["template"],
          status: pick.eff as "LIVE" | "SCHEDULED",
          startsAt: pick.c.startsAt?.toISOString() ?? null,
          endsAt: pick.c.endsAt?.toISOString() ?? null,
          rewards: (pick.rules as CampaignRules | null)?.fundingSource && (pick.rules as CampaignRules).fundingSource !== "none" ? "token" : "none",
        }
      : null;
    const pos = lotPosition(r.districtId as DistrictId, r.plotIndex);
    return {
      spaceId: r.spaceId,
      slug: r.slug,
      name: r.name,
      tagline: r.tagline,
      category: r.category,
      districtId: r.districtId,
      plotIndex: r.plotIndex,
      x: pos.x,
      y: pos.y,
      logoUrl: r.logoUploadId ? `/api/uploads/${r.logoUploadId}` : null,
      flags,
      kind,
      liveCampaigns: live.length,
      upcomingCampaigns: upcoming.length,
      templates: [...new Set(live.map((x) => x.c.template))],
      featured,
    };
  });
  return { buildings, routes: [], generatedAt: new Date().toISOString() };
}
