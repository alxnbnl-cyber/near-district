import "server-only";
import type { Prize } from "@/world/types";

/** Local demo mode only (DEMO_REWARDS=1, never in production). Every sample is flagged demo. */
export function demoEnabled(): boolean {
  return process.env.DEMO_REWARDS === "1" && process.env.NODE_ENV !== "production";
}

/** Deterministic sample prize for a campaign id, so the map and the mission page agree. */
export function demoPrize(campaignId: string, symbol: string): Prize {
  let h = 0;
  for (const ch of campaignId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const yieldPrize = h % 2 === 0;
  return {
    amount: (250 + (h % 19) * 125).toLocaleString("en"),
    symbol,
    kind: yieldPrize ? "yield" : "budget",
    demo: true,
    apy: yieldPrize ? `${(6 + (h % 50) / 10).toFixed(1)}%` : undefined,
  };
}
