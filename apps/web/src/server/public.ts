import "server-only";
import { and, campaigns, count, desc, eq, inArray, organizations, participantEntries, spaces, vaultPositions, worldBuildings } from "@near-district/db";
import { formatDisplay, type CampaignRules } from "@near-district/core";
import { token } from "./near";
import { demoEnabled, demoPrize } from "./demo";
import { db } from "./db";
import { currentRules, effectiveStatus } from "./campaigns";

export async function getPublicSpace(slug: string) {
  const database = await db();
  const [row] = await database
    .select({ space: spaces, org: organizations, building: worldBuildings })
    .from(spaces)
    .innerJoin(organizations, eq(organizations.id, spaces.organizationId))
    .leftJoin(worldBuildings, eq(worldBuildings.spaceId, spaces.id))
    .where(eq(spaces.slug, slug))
    .limit(1);
  if (!row || row.space.moderation !== "approved" || row.org.status !== "approved") return null;
  const list = await database
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.spaceId, row.space.id), eq(campaigns.moderation, "approved"), inArray(campaigns.status, ["SCHEDULED", "LIVE", "PAUSED", "ENDED", "AWAITING_RESULTS", "COMPLETED"])))
    .orderBy(desc(campaigns.publishedAt));
  const withStatus = list.map((c) => ({ ...c, effective: effectiveStatus(c as never) }));
  return {
    ...row,
    active: withStatus.filter((c) => c.effective === "LIVE" || c.effective === "PAUSED"),
    upcoming: withStatus.filter((c) => c.effective === "SCHEDULED"),
    past: withStatus.filter((c) => ["ENDED", "AWAITING_RESULTS", "COMPLETED"].includes(c.effective)),
  };
}

export async function getPublicCampaign(spaceSlug: string, campaignSlug: string) {
  const database = await db();
  const [row] = await database
    .select({ c: campaigns, space: spaces })
    .from(campaigns)
    .innerJoin(spaces, eq(spaces.id, campaigns.spaceId))
    .where(and(eq(spaces.slug, spaceSlug), eq(campaigns.slug, campaignSlug)))
    .limit(1);
  if (!row || row.space.moderation !== "approved" || row.c.moderation !== "approved" || !row.c.currentVersion) return null;
  const rules = (await currentRules(database, row.c)) as CampaignRules;
  const [{ n } = { n: 0 }] = await database.select({ n: count() }).from(participantEntries).where(eq(participantEntries.campaignId, row.c.id));
  // Prize pool only from the latest on-chain vault snapshot; never from a form field.
  let prize: import("@/world/types").Prize | null = null;
  if (row.c.vaultCampaignId !== null) {
    const [snap] = await database.select().from(vaultPositions).where(eq(vaultPositions.campaignId, row.c.id)).orderBy(desc(vaultPositions.observedAt)).limit(1);
    const t = token();
    const v = snap ? snap.bonusAvailable + snap.yieldAvailable + snap.reserved : 0n;
    if (v > 0n) prize = { amount: formatDisplay(v, t.decimals, 0), symbol: t.symbol };
  }
  if (!prize && demoEnabled()) prize = demoPrize(row.c.id, token().symbol, { raw: rules.plannedDirectBudget, decimals: token().decimals });
  return { campaign: row.c, space: row.space, rules, participants: n, status: effectiveStatus(row.c as never), prize };
}

export async function listLiveExperiences() {
  const database = await db();
  const rows = await database
    .select({ c: campaigns, space: spaces })
    .from(campaigns)
    .innerJoin(spaces, eq(spaces.id, campaigns.spaceId))
    .innerJoin(organizations, eq(organizations.id, spaces.organizationId))
    .where(and(inArray(campaigns.status, ["SCHEDULED", "LIVE"]), eq(campaigns.moderation, "approved"), eq(spaces.moderation, "approved"), eq(organizations.status, "approved")))
    .orderBy(desc(campaigns.publishedAt))
    .limit(200);
  return rows.map((r) => ({ ...r, status: effectiveStatus(r.c as never) })).filter((r) => r.status === "LIVE" || r.status === "SCHEDULED");
}
