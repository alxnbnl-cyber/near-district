import { DISTRICTS } from "@near-district/core/world";
import { Badge } from "@/components/ui";
import type { ActivityFlag } from "@/world/types";

export const DISTRICT_TONE: Record<string, "orange" | "violet" | "mint" | "sky"> = Object.fromEntries(
  DISTRICTS.map((d) => [d.id, d.theme as "orange" | "violet" | "mint" | "sky"]),
);

export function districtName(id: string): string {
  return DISTRICTS.find((d) => d.id === id)?.name ?? id;
}

export function FlagBadges({ flags }: { flags: ActivityFlag[] }) {
  return (
    <>
      {flags.includes("ending_soon") && <Badge tone="gold">Ending soon</Badge>}
      {flags.includes("featured") && <Badge tone="violet">Featured</Badge>}
      {flags.includes("new") && <Badge tone="sky">New</Badge>}
    </>
  );
}
