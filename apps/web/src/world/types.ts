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
  /** "none" = no token rewards; otherwise funded through the vault. */
  rewards: "none" | "token";
  /** Prize pool from the latest on-chain vault snapshot (available + reserved). Null when unknown. */
  prize: Prize | null;
}

export interface Prize {
  amount: string;
  symbol: string;
  /** Sample value for local demos only (DEMO_REWARDS=1). Always shown with a DEMO tag. */
  demo?: boolean;
}

/** The signed-in player's real progress (null when signed out). */
export interface ViewerStats {
  missionsCompleted: number;
  missionsStarted: number;
  rewardsClaimed: string;
  symbol: string;
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
  /** Largest verified prize pool among this vault's live quests. */
  topPrize: Prize | null;
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
  prize: Prize | null;
  spaceId: string;
  spaceSlug: string;
  spaceName: string;
}

export interface WorldData {
  buildings: WorldBuildingData[];
  experiences: WorldExperience[];
  routes: WorldRoute[];
  viewer: ViewerStats | null;
  /** True when sample prizes are shown (local demo mode). */
  demo: boolean;
  generatedAt: string;
}
