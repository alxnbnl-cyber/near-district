import { districtForCategory, nextFreePlotIndex } from "@near-district/core";
import { eq, sql } from "drizzle-orm";
import { worldBuildings } from "./schema";
import type { Tx } from "./index";

/**
 * Assigns a Space the lowest free plot in its category's district. A per-district advisory
 * lock serializes concurrent assignments; the unique (district, plot) index is the backstop.
 * Plots are never reassigned, so a building never moves.
 */
export async function assignBuildingPlot(tx: Tx, spaceId: string, category: string): Promise<{ districtId: string; plotIndex: number }> {
  const district = districtForCategory(category);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"world:" + district.id}))`);
  const taken = await tx.select({ plotIndex: worldBuildings.plotIndex }).from(worldBuildings).where(eq(worldBuildings.districtId, district.id));
  const plotIndex = nextFreePlotIndex(taken.map((t) => t.plotIndex));
  await tx.insert(worldBuildings).values({ spaceId, districtId: district.id, plotIndex });
  return { districtId: district.id, plotIndex };
}
