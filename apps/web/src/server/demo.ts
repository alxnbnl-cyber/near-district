import "server-only";
import type { Prize } from "@/world/types";

/** Local demo mode only (DEMO_REWARDS=1, never in production). Every sample is flagged demo. */
export function demoEnabled(): boolean {
  return process.env.DEMO_REWARDS === "1" && process.env.NODE_ENV !== "production";
}

/**
 * Sample prize for a campaign: its planned fixed prize when set, otherwise a deterministic
 * amount from the id, so the map and the mission page agree.
 */
export function demoPrize(campaignId: string, symbol: string, planned?: { raw?: string; decimals: number }): Prize {
  let h = 0;
  for (const ch of campaignId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const plannedWhole = planned?.raw ? Number(BigInt(planned.raw) / 10n ** BigInt(planned.decimals)) : 0;
  return {
    amount: (plannedWhole > 0 ? plannedWhole : 20 + (h % 19) * 10).toLocaleString("en"), // planned, or $20 – $200
    symbol,
    demo: true,
  };
}

/** Sample company logos for projects that haven't uploaded one (demo mode only). */
const DEMO_LOGOS = ["/assets/demo/logo-paw.webp", "/assets/demo/logo-r.webp"];
export function demoLogo(spaceId: string): string {
  let h = 0;
  for (const ch of spaceId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DEMO_LOGOS[h % DEMO_LOGOS.length]!;
}
