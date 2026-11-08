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

/** A cross-Space adventure route. Empty until the Adventures feature ships — never invented. */
export interface WorldRoute {
  id: string;
  title: string;
  stops: { spaceId: string; completed: boolean }[];
}

export interface WorldData {
  buildings: WorldBuildingData[];
  routes: WorldRoute[];
  generatedAt: string;
}
