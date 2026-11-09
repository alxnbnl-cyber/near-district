export type ActivityFlag = "live" | "new" | "featured" | "ending_soon";

/** What a Space's marker communicates first. Derived from real campaign rows only. */
export type MarkerKind = "hunt" | "contest" | "upcoming" | "space";

export interface FeaturedCampaign {
  title: string;
  slug: string;
  template: "treasure_hunt" | "creative_contest";
  status: "LIVE" | "SCHEDULED";
  startsAt: string | null;
  endsAt: string | null;
  /** "none" = no token rewards; otherwise funded through the vault (amount only shown once finalized). */
  rewards: "none" | "token";
}

export interface WorldBuildingData {
  spaceId: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  districtId: string;
  plotIndex: number;
  /** Normalized map position (0..1), deterministic from district + plot. */
  x: number;
  y: number;
  logoUrl: string | null;
  flags: ActivityFlag[];
  kind: MarkerKind;
  liveCampaigns: number;
  upcomingCampaigns: number;
  templates: string[];
  featured: FeaturedCampaign | null;
}

/** A published shared expedition: chapter order approved by every participating organization. */
export interface WorldRouteChapter {
  campaignId: string;
  title: string;
  campaignSlug: string;
  template: string;
  spaceId: string;
  spaceSlug: string;
  spaceName: string;
  /** Viewer's real progress (false for signed-out visitors). */
  completed: boolean;
  unlocked: boolean;
  reward: boolean;
}

export interface WorldRoute {
  id: string;
  slug: string;
  title: string;
  summary: string;
  completedAt: string | null;
  chapters: WorldRouteChapter[];
}

export interface WorldExperience {
  id: string;
  title: string;
  slug: string;
  summary: string;
  template: "treasure_hunt" | "creative_contest";
  status: "LIVE" | "SCHEDULED";
  startsAt: string | null;
  endsAt: string | null;
  rewards: "none" | "token";
  spaceId: string;
  spaceSlug: string;
  spaceName: string;
}

export interface WorldData {
  buildings: WorldBuildingData[];
  experiences: WorldExperience[];
  routes: WorldRoute[];
  generatedAt: string;
}
