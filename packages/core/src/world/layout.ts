/**
 * Deterministic, collision-free world layout.
 *
 * The world is an isometric tile grid. Tiles are grouped into square PLOTS. The two
 * axes x=0 and y=0 (in plot space) are the main avenues; the plot at the origin is the
 * Town Square. Each district owns one quadrant and fills it diagonally outward, so:
 *   - districts can never overlap (they live in disjoint quadrants),
 *   - a district never runs out of space (quadrants are unbounded),
 *   - the k-th Space in a district always lands on the same plot.
 * The assigned plot index is persisted (world_buildings.plot_index, unique per district),
 * so positions never shift when other Spaces are added or removed.
 */

export const TILE_W = 128;
export const TILE_H = 64;
export const PLOT_TILES = 4; // 3x3 building footprint + 1 tile of street

export type DistrictId = "discovery" | "mystery" | "creators" | "community";

export interface DistrictDef {
  id: DistrictId;
  name: string;
  tagline: string;
  /** Quadrant sign in plot space. */
  sx: 1 | -1;
  sy: 1 | -1;
  /** Palette key, resolved by the renderer theme. */
  theme: "orange" | "violet" | "mint" | "sky";
  categories: readonly string[];
}

export const DISTRICTS: readonly DistrictDef[] = [
  {
    id: "discovery",
    name: "Northgate",
    tagline: "Projects & products",
    sx: -1,
    sy: -1,
    theme: "orange",
    categories: ["project", "defi", "infrastructure", "tooling", "other"],
  },
  {
    id: "mystery",
    name: "Old Quarter",
    tagline: "Puzzles & treasure hunts",
    sx: 1,
    sy: -1,
    theme: "violet",
    categories: ["puzzle", "gaming"],
  },
  {
    id: "creators",
    name: "Harbor Works",
    tagline: "Creators & contests",
    sx: 1,
    sy: 1,
    theme: "mint",
    categories: ["creative", "art", "media"],
  },
  {
    id: "community",
    name: "Westfield",
    tagline: "Communities & DAOs",
    sx: -1,
    sy: 1,
    theme: "sky",
    categories: ["community", "dao", "education", "social"],
  },
] as const;

export const SPACE_CATEGORIES = [...new Set(DISTRICTS.flatMap((d) => d.categories))] as readonly string[];

export function districtForCategory(category: string): DistrictDef {
  return DISTRICTS.find((d) => d.categories.includes(category)) ?? DISTRICTS[0]!;
}

export function getDistrict(id: string): DistrictDef {
  const d = DISTRICTS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown district ${id}`);
  return d;
}

/**
 * Local quadrant coordinates (i, j >= 0) of the n-th plot, filling diagonals
 * i + j = 0, 1, 2, ... in order. Closed form, O(sqrt n).
 */
export function quadrantPlot(n: number): { i: number; j: number } {
  if (!Number.isInteger(n) || n < 0) throw new Error("plot index must be a non-negative integer");
  let d = 0;
  let remaining = n;
  while (remaining > d) {
    remaining -= d + 1;
    d += 1;
  }
  // diagonal d has d+1 plots; walk from the middle outward so districts grow compactly
  const order = diagonalOrder(d);
  const i = order[remaining]!;
  return { i, j: d - i };
}

const diagonalCache = new Map<number, number[]>();
function diagonalOrder(d: number): number[] {
  const cached = diagonalCache.get(d);
  if (cached) return cached;
  const mid = d / 2;
  const xs = Array.from({ length: d + 1 }, (_, k) => k).sort(
    (a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b,
  );
  if (diagonalCache.size < 512) diagonalCache.set(d, xs);
  return xs;
}

export interface PlotPosition {
  plotX: number;
  plotY: number;
  /** Tile coordinate of the footprint's top corner. */
  tileX: number;
  tileY: number;
}

export function plotPosition(district: DistrictDef, plotIndex: number): PlotPosition {
  const { i, j } = quadrantPlot(plotIndex);
  const plotX = district.sx * (i + 1);
  const plotY = district.sy * (j + 1);
  // Plot p spans tiles [p*4, p*4+3]; tile p*4 is street, the 3x3 footprint starts at p*4+1.
  // Plot 0 on each axis is a 4-tile-wide avenue, so no footprint ever touches another.
  return { plotX, plotY, tileX: plotX * PLOT_TILES + 1, tileY: plotY * PLOT_TILES + 1 };
}

/** Isometric projection of a tile coordinate to world pixels. */
export function tileToWorld(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx - ty) * (TILE_W / 2), y: (tx + ty) * (TILE_H / 2) };
}

/** Inverse projection (continuous). */
export function worldToTile(x: number, y: number): { tx: number; ty: number } {
  const a = x / (TILE_W / 2);
  const b = y / (TILE_H / 2);
  return { tx: (a + b) / 2, ty: (b - a) / 2 };
}

/** The lowest unused plot index for a district given the indexes already taken. */
export function nextFreePlotIndex(taken: Iterable<number>): number {
  const set = new Set(taken);
  let n = 0;
  while (set.has(n)) n++;
  return n;
}

/** Stable 32-bit FNV-1a hash for deterministic decoration. Not for security. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Bounding plot radius needed to contain the given number of plots per district. */
export function plotRadiusFor(maxPlotsInAnyDistrict: number): number {
  if (maxPlotsInAnyDistrict <= 0) return 2;
  const { i, j } = quadrantPlot(maxPlotsInAnyDistrict - 1);
  return Math.max(2, i + j + 2);
}
