/**
 * NEAR District city v3 — one fixed, original, fictional city in a game-map style:
 * organic street network, filled city blocks with building footprints, parks, a branching
 * river, a coastline with piers and islands. No districts and no central hub: Spaces are
 * scattered across the whole city.
 *
 * Deterministic (seeded PRNG + value noise, no Math.random), so a Space's position is a pure
 * function of (districtId, plotIndex) and is stable across sessions and screen sizes.
 * Bump ATLAS_VERSION only together with a migration that pins existing Spaces' positions.
 */
import { DISTRICTS, type DistrictId } from "./layout";
import artwork from "./artwork-lots.json";

/**
 * Pin spots on the painted world map (apps/web/public/assets/world), found by scripts/map-lots.cjs:
 * dry land beside a road, never water. When present they replace the procedural lots.
 */
export const ARTWORK_LOTS: readonly (readonly [number, number])[] = (artwork as unknown as { lots: [number, number][] }).lots;

export const ATLAS_VERSION = 3;
export const ATLAS_W = 9000;
export const ATLAS_H = 6000;

export type Pt = [number, number];

export interface AtlasBlock {
  poly: number[]; // flat [x,y,...], already inset from the street
  chunk: number;
}

export interface Atlas {
  version: number;
  width: number;
  height: number;
  coast: Pt[];
  sea: number[]; // polygon
  rivers: { pts: Pt[]; width: number }[];
  islands: Pt[][];
  blocks: AtlasBlock[];
  parks: { poly: number[]; chunk: number }[];
  buildings: { poly: number[]; shade: number; chunk: number }[];
  roads: { pts: Pt[]; width: number }[];
  piers: number[][];
  chunks: { cols: number; rows: number; w: number; h: number };
  lots: Record<DistrictId, Pt[]>;
}

// ------------------------------------------------------------------ primitives

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed: number) {
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = fade(x - xi), yf = fade(y - yi);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return (a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf) * 2 - 1;
  };
}

function catmull(points: Pt[], steps = 12): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!, p1 = points[i]!, p2 = points[i + 1]!, p3 = points[Math.min(points.length - 1, i + 2)]!;
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

export function distToPolyline(p: Pt, line: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i]!, [bx, by] = line[i + 1]!;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy));
    if (d < best) best = d;
  }
  return best;
}

export function coastXAt(coast: Pt[], y: number): number {
  for (let i = 0; i < coast.length - 1; i++) {
    const a = coast[i]!, b = coast[i + 1]!;
    if ((a[1] <= y && y <= b[1]) || (b[1] <= y && y <= a[1])) {
      const t = (y - a[1]) / (b[1] - a[1] || 1);
      return a[0] + (b[0] - a[0]) * t;
    }
  }
  return ATLAS_W;
}

function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function blob(c: Pt, r: number, noise: (x: number, y: number) => number, aspect = 1, rot = 0, n = 32): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const rr = r * (1 + 0.32 * noise(Math.cos(t) * 1.7 + c[0] * 0.003, Math.sin(t) * 1.7 + c[1] * 0.003));
    const ex = Math.cos(t) * rr * aspect, ey = Math.sin(t) * rr;
    pts.push([c[0] + ex * Math.cos(rot) - ey * Math.sin(rot), c[1] + ex * Math.sin(rot) + ey * Math.cos(rot)]);
  }
  return pts;
}

// ------------------------------------------------------------------ generator

let cached: Atlas | null = null;

export function generateAtlas(): Atlas {
  if (cached) return cached;
  const W = ATLAS_W, H = ATLAS_H;
  const rnd = mulberry32(0x7a11e5);
  const nA = makeNoise(3), nB = makeNoise(7), nDen = makeNoise(13), nPark = makeNoise(17), nBlob = makeNoise(23);

  // coastline (sea to the east / south-east)
  const coast = catmull(
    [
      [W * 0.9, -60], [W * 0.86, H * 0.1], [W * 0.9, H * 0.22], [W * 0.84, H * 0.33], [W * 0.79, H * 0.42], [W * 0.83, H * 0.52],
      [W * 0.77, H * 0.62], [W * 0.7, H * 0.7], [W * 0.73, H * 0.8], [W * 0.66, H * 0.9], [W * 0.62, H + 60],
    ],
    18,
  );
  const sea = [...coast.flat(), W + 4000, H + 4000, W + 4000, -4000];

  // a main river and a tributary that joins it
  const main = catmull(
    [[W * 0.3, -80], [W * 0.33, H * 0.12], [W * 0.42, H * 0.22], [W * 0.38, H * 0.36], [W * 0.47, H * 0.47], [W * 0.56, H * 0.52], [W * 0.66, H * 0.5], [W * 0.8, H * 0.47]],
    20,
  );
  const branch = catmull([[-80, H * 0.66], [W * 0.12, H * 0.62], [W * 0.24, H * 0.68], [W * 0.36, H * 0.6], [W * 0.47, H * 0.48]], 18);
  const rivers = [
    { pts: main, width: 230 },
    { pts: branch, width: 150 },
  ];

  // islands in the sea
  const islands: Pt[][] = [];
  const islandCentres: Pt[] = [];
  for (let tries = 0; tries < 300 && islands.length < 7; tries++) {
    const c: Pt = [W * (0.72 + rnd() * 0.27), H * (0.05 + rnd() * 0.92)];
    const r = 90 + rnd() * 220;
    if (c[0] < coastXAt(coast, c[1]) + r + 120) continue;
    if (islandCentres.some((k) => Math.hypot(k[0] - c[0], k[1] - c[1]) < r + 500)) continue;
    islandCentres.push(c);
    islands.push(blob(c, r, nBlob, 0.8 + rnd() * 0.8, rnd() * Math.PI, 26));
  }

  const inWater = (p: Pt, margin: number) =>
    p[0] > coastXAt(coast, p[1]) - margin || rivers.some((r) => distToPolyline(p, r.pts) < r.width / 2 + margin);
  const inBounds = (p: Pt, m: number) => p[0] > m && p[1] > m && p[0] < W - m && p[1] < H - m;

  // several town centres give density without a single hub
  const towns: { c: Pt; s: number }[] = [];
  for (let tries = 0; tries < 600 && towns.length < 9; tries++) {
    const c: Pt = [W * (0.06 + rnd() * 0.8), H * (0.06 + rnd() * 0.88)];
    if (inWater(c, 200) || towns.some((t) => Math.hypot(t.c[0] - c[0], t.c[1] - c[1]) < 1500)) continue;
    towns.push({ c, s: 900 + rnd() * 900 });
  }
  const density = (p: Pt) => {
    let d = 0;
    for (const t of towns) d = Math.max(d, Math.exp(-((p[0] - t.c[0]) ** 2 + (p[1] - t.c[1]) ** 2) / (2 * t.s * t.s)));
    return Math.min(1, d + 0.12 + nDen(p[0] * 0.0006, p[1] * 0.0006) * 0.18);
  };
  const isPark = (p: Pt) => nPark(p[0] * 0.0009, p[1] * 0.0009) > 0.5;

  // chunks for culling
  const CH_W = 1500, CH_H = 1500;
  const cols = Math.ceil(W / CH_W), rows = Math.ceil(H / CH_H);
  const chunkOf = (p: Pt) => Math.min(cols - 1, Math.max(0, Math.floor(p[0] / CH_W))) + Math.min(rows - 1, Math.max(0, Math.floor(p[1] / CH_H))) * cols;

  // warped street lattice
  const SP = 120;
  const ang = 0.18;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const span = Math.hypot(W, H) * 0.62;
  const n = Math.ceil((span * 2) / SP);
  const node = (i: number, j: number): Pt => {
    const u = -span + i * SP, v = -span + j * SP;
    const bx = u * ca - v * sa + W / 2, by = u * sa + v * ca + H / 2;
    return [
      bx + nA(bx * 0.00042, by * 0.00042) * 340 + nA(bx * 0.0016, by * 0.0016) * 60 + nA(bx * 0.006, by * 0.006) * 9,
      by + nB(bx * 0.00042, by * 0.00042) * 340 + nB(bx * 0.0016, by * 0.0016) * 60 + nB(bx * 0.006, by * 0.006) * 9,
    ];
  };
  const grid: Pt[][] = [];
  for (let i = 0; i <= n; i++) {
    grid.push([]);
    for (let j = 0; j <= n; j++) grid[i]!.push(node(i, j));
  }

  const blocks: AtlasBlock[] = [];
  const parks: Atlas["parks"] = [];
  const buildings: Atlas["buildings"] = [];
  const kept: boolean[][] = [];
  const centroids: { p: Pt; ok: boolean }[] = [];
  const inset = (q: Pt[], d: number): Pt[] => {
    const c: Pt = [(q[0]![0] + q[1]![0] + q[2]![0] + q[3]![0]) / 4, (q[0]![1] + q[1]![1] + q[2]![1] + q[3]![1]) / 4];
    return q.map((p) => {
      const dx = c[0] - p[0], dy = c[1] - p[1], len = Math.hypot(dx, dy) || 1;
      return [p[0] + (dx / len) * d, p[1] + (dy / len) * d] as Pt;
    });
  };
  const bilerp = (q: Pt[], u: number, v: number): Pt => {
    const a: Pt = [q[0]![0] + (q[1]![0] - q[0]![0]) * u, q[0]![1] + (q[1]![1] - q[0]![1]) * u];
    const b: Pt = [q[3]![0] + (q[2]![0] - q[3]![0]) * u, q[3]![1] + (q[2]![1] - q[3]![1]) * u];
    return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v];
  };

  for (let i = 0; i < n; i++) {
    kept.push([]);
    for (let j = 0; j < n; j++) {
      const q = [grid[i]![j]!, grid[i + 1]![j]!, grid[i + 1]![j + 1]!, grid[i]![j + 1]!];
      const c: Pt = [(q[0]![0] + q[1]![0] + q[2]![0] + q[3]![0]) / 4, (q[0]![1] + q[1]![1] + q[2]![1] + q[3]![1]) / 4];
      const keep = inBounds(c, 60) && !inWater(c, 70) && rnd() < 0.18 + density(c) * 0.9;
      kept[i]!.push(keep);
      if (!keep) continue;
      const chunk = chunkOf(c);
      if (isPark(c)) {
        parks.push({ poly: q.flat(), chunk });
        continue;
      }
      const major = i % 6 === 0 || j % 6 === 0 || (i + 1) % 6 === 0 || (j + 1) % 6 === 0;
      const block = inset(q, major ? 22 : 13);
      blocks.push({ poly: block.flat(), chunk });
      centroids.push({ p: c, ok: density(c) > 0.35 });
      const nu = 2 + Math.floor(rnd() * 2), nv = 2 + Math.floor(rnd() * 2);
      for (let a = 0; a < nu; a++) {
        for (let b = 0; b < nv; b++) {
          if (rnd() < 0.14) continue;
          const g = 0.07;
          const u0 = a / nu + g, u1 = (a + 1) / nu - g, v0 = b / nv + g, v1 = (b + 1) / nv - g;
          const fp = [bilerp(block, u0, v0), bilerp(block, u1, v0), bilerp(block, u1, v1), bilerp(block, u0, v1)];
          buildings.push({ poly: fp.flat(), shade: Math.floor(rnd() * 3), chunk });
        }
      }
    }
  }

  // major roads run along every 6th lattice line through the built-up area
  const roads: Atlas["roads"] = [];
  const isNear = (i: number, j: number) => Boolean(kept[i]?.[j] || kept[i - 1]?.[j] || kept[i]?.[j - 1] || kept[i - 1]?.[j - 1]);
  const pushLine = (pts: Pt[]) => {
    if (pts.length > 2) roads.push({ pts, width: 30 });
  };
  for (let i = 0; i <= n; i += 6) {
    let run: Pt[] = [];
    for (let j = 0; j <= n; j++) {
      if (isNear(i, j)) run.push(grid[i]![j]!);
      else {
        pushLine(run);
        run = [];
      }
    }
    pushLine(run);
  }
  for (let j = 0; j <= n; j += 6) {
    let run: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      if (isNear(i, j)) run.push(grid[i]![j]!);
      else {
        pushLine(run);
        run = [];
      }
    }
    pushLine(run);
  }

  // harbour piers along the south-east coast
  const piers: number[][] = [];
  for (let y = H * 0.52; y < H * 0.97; y += 110 + rnd() * 90) {
    if (rnd() < 0.3) continue;
    const x = coastXAt(coast, y);
    const len = 160 + rnd() * 220, w = 34 + rnd() * 26;
    piers.push([x - 20, y, x + len, y, x + len, y + w, x - 20, y + w]);
  }

  // lots: scattered across the whole city, spaced so each Space has room for its area
  const pool = centroids.filter((c) => c.ok && inBounds(c.p, 300) && !inWater(c.p, 220));
  for (let i = pool.length - 1; i > 0; i--) {
    const k = Math.floor(rnd() * (i + 1));
    [pool[i], pool[k]] = [pool[k]!, pool[i]!];
  }
  const picked: Pt[] = [];
  for (const c of pool) {
    if (picked.every((p) => Math.hypot(p[0] - c.p[0], p[1] - c.p[1]) >= 470)) picked.push(c.p);
  }
  const lots = {} as Record<DistrictId, Pt[]>;
  DISTRICTS.forEach((d, k) => (lots[d.id] = picked.filter((_, idx) => idx % DISTRICTS.length === k)));

  cached = { version: ATLAS_VERSION, width: W, height: H, coast, sea, rivers, islands, blocks, parks, buildings, roads, piers, chunks: { cols, rows, w: CH_W, h: CH_H }, lots };
  return cached;
}

/**
 * Normalized (0..1) marker position for the n-th Space of a placement group. Groups are
 * interleaved across the whole city, so Spaces appear scattered, never clustered by category.
 */
export function lotPosition(districtId: DistrictId, plotIndex: number): { x: number; y: number } {
  if (ARTWORK_LOTS.length) {
    // Interleave groups so every (group, plot) pair gets its own spot until the map is full.
    const k = Math.max(0, DISTRICTS.findIndex((d) => d.id === districtId));
    const g = plotIndex * DISTRICTS.length + k;
    const [x, y] = ARTWORK_LOTS[g % ARTWORK_LOTS.length]!;
    const lap = Math.floor(g / ARTWORK_LOTS.length);
    if (lap === 0) return { x, y };
    const t = lap * 2.399;
    return { x: x + Math.cos(t) * 0.012 * Math.sqrt(lap), y: y + Math.sin(t) * 0.018 * Math.sqrt(lap) };
  }
  const a = generateAtlas();
  const lots = a.lots[districtId];
  if (!lots || lots.length === 0) throw new Error(`no lots for ${districtId}`);
  let p = lots[plotIndex % lots.length]!;
  const lap = Math.floor(plotIndex / lots.length);
  if (lap > 0) {
    const t = lap * 2.399;
    p = [p[0] + Math.cos(t) * 140 * Math.sqrt(lap), p[1] + Math.sin(t) * 140 * Math.sqrt(lap)];
  }
  return { x: p[0] / a.width, y: p[1] / a.height };
}

export function isOnLand(xNorm: number, yNorm: number): boolean {
  const a = generateAtlas();
  const p: Pt = [xNorm * a.width, yNorm * a.height];
  if (p[0] > coastXAt(a.coast, p[1])) return false;
  if (a.rivers.some((r) => distToPolyline(p, r.pts) < r.width / 2)) return false;
  return !a.islands.some((isl) => pointInPoly(p, isl));
}
