import "server-only";
import type { Prize } from "@/world/types";
import { FIXED_REWARDS_ENABLED } from "@/lib/features";

/** Local demo mode only (DEMO_REWARDS=1, never in production). Every sample is flagged demo. */
export function demoEnabled(): boolean {
  return process.env.DEMO_REWARDS === "1" && process.env.NODE_ENV !== "production";
}

/** Deterministic sample prize for a campaign id, so the map and the mission page agree. */
export function demoPrize(campaignId: string, symbol: string): Prize {
  let h = 0;
  for (const ch of campaignId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const yieldPrize = FIXED_REWARDS_ENABLED ? h % 2 === 0 : true; // fixed rewards are hidden for now
  return {
    amount: (20 + (h % 19) * 10).toLocaleString("en"), // $20 – $200
    symbol,
    kind: yieldPrize ? "yield" : "budget",
    demo: true,
    apy: yieldPrize ? `${(6 + (h % 50) / 10).toFixed(1)}%` : undefined,
  };
}

/** Sample company logos for projects that haven't uploaded one (demo mode only). */
const DEMO_LOGOS = ["/assets/demo/logo-paw.webp", "/assets/demo/logo-r.webp"];
export function demoLogo(spaceId: string): string {
  let h = 0;
  for (const ch of spaceId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DEMO_LOGOS[h % DEMO_LOGOS.length]!;
}
