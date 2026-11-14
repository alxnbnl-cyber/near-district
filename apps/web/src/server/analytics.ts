import "server-only";
import { headers } from "next/headers";
import { analyticsEvents } from "@near-district/db";
import { db } from "./db";
import { dailyVisitorHash } from "./crypto";

/**
 * Privacy-preserving view counting: one row per (kind, target, visitor, day), where the visitor
 * hash rotates daily and no IP or user agent is stored. Failures never break the page.
 */
export async function trackView(kind: "space_view" | "campaign_view", spaceId: string | null, campaignId: string | null) {
  try {
    const h = await headers();
    if (h.get("purpose") === "prefetch" || h.get("next-router-prefetch")) return;
    const ua = h.get("user-agent") ?? "";
    if (/bot|crawler|spider|preview/i.test(ua)) return;
    const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const day = new Date().toISOString().slice(0, 10);
    const database = await db();
    await database
      .insert(analyticsEvents)
      .values({ kind, spaceId, campaignId, visitorHash: dailyVisitorHash(ip, ua, day), day })
      .onConflictDoNothing();
  } catch {
    // analytics is best-effort
  }
}
