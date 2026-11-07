export type ActivityFlag = "live" | "new" | "featured" | "ending_soon";

export interface WorldBuildingData {
  spaceId: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  districtId: string;
  plotIndex: number;
  style: string;
  logoUrl: string | null;
  flags: ActivityFlag[];
  liveCampaigns: number;
  upcomingCampaigns: number;
  templates: string[];
}

export interface WorldData {
  buildings: WorldBuildingData[];
  generatedAt: string;
}
