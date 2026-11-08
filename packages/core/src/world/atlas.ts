/**
 * Yielvy City — one fixed, original, fictional 2D city map, generated deterministically.
 *
 * Same output on every machine and every run (seeded PRNG, no Math.random), so:
 *  - the server can compute a Space's marker position from (district, plotIndex),
 *  - positions are stable across sessions and screen sizes (normalized 0..1 coordinates),
 *  - nothing about the map lives in the database.
 *
 * Bump ATLAS_VERSION only together with a migration that pins existing Spaces' positions.
 */
import { DISTRICTS, type DistrictId } from "./layout";

export const ATLAS_VERSION = 1;
export const ATLAS_W = 4800;
export const ATLAS_H = 3200;

export type Pt = [number, number];

export interface AtlasBlock {
  poly: number[]; // flat [x,y,...]
  district: DistrictId | "central";
  park: boolean;
}

export interface AtlasDistrict {
  id: DistrictId;
  name: string;
  caption: string;
  seed: Pt;
  label: Pt;
}

export interface Atlas {
  version: number;
  width: number;
  height: number;
  coast: Pt[]; // polyline top→bottom; sea is everything east of it
  river: Pt[];
  riverWidth: number;
  blocks: AtlasBlock[];
  buildings: { poly: number[]; shade: number; district: DistrictId | "central" }[];
  arterials: { pts: Pt[]; width: number }[];
  central: { center: Pt; radius: number };
  districts: AtlasDistrict[];
  lots: Record<DistrictId, Pt[]>;
}

/** Fictional district names, each paired with a plain-language caption so function stays clear. */
export const DISTRICT_META: Record<DistrictId, { name: string; caption: string; seed: Pt; angle: number }> = {
  discovery: { name: "Northgate", caption: "Projects & products", seed: [0.24, 0.27], angle: 0.14 },
  mystery: { name: "Old Quarter", caption: "Puzzles & treasure hunts", seed: [0.6, 0.24], angle: -0.32 },
  creators: { name: "Harbor Works", caption: "Creators & contests", seed: [0.6, 0.73], angle: 0.42 },
  community: { name: "Westfield", caption: "Communities & DAOs", seed: [0.22, 0.72], angle: -0.06 },
};

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

function distToPolyline(p: Pt, line: Pt[]): number {
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

function coastXAt(coast: Pt[], y: number): number {
  for (let i = 0; i < coast.length - 1; i++) {
    const a = coast[i]!, b = coast[i + 1]!;
    if ((a[1] <= y && y <= b[1]) || (b[1] <= y && y <= a[1])) {
      const t = (y - a[1]) / (b[1] - a[1] || 1);
      return a[0] + (b[0] - a[0]) * t;
    }
  }
  return ATLAS_W;
}

let cached: Atlas | null = null;

export function generateAtlas(): Atlas {
  if (cached) return cached;
  const W = ATLAS_W, H = ATLAS_H;
  const rnd = mulberry32(0x5e1f17);

  const coast = catmull(
    [
      [W * 0.86, -40], [W * 0.83, H * 0.12], [W * 0.88, H * 0.26], [W * 0.84, H * 0.4], [W * 0.8, H * 0.52],
      [W * 0.83, H * 0.64], [W * 0.76, H * 0.78], [W * 0.7, H * 0.9], [W * 0.66, H + 40],
    ],
    16,
  );
  const river = catmull(
    [
      [W * 0.36, -60], [W * 0.38, H * 0.14], [W * 0.46, H * 0.27], [W * 0.43, H * 0.4], [W * 0.5, H * 0.5],
      [W * 0.58, H * 0.56], [W * 0.66, H * 0.6], [W * 0.75, H * 0.66], [W * 0.82, H * 0.66],
    ],
    18,
  );
  const riverWidth = 110;
  const central = { center: [W * 0.47, H * 0.47] as Pt, radius: 300 };

  const seeds = DISTRICTS.map((d) => ({ id: d.id, p: [DISTRICT_META[d.id].seed[0] * W, DISTRICT_META[d.id].seed[1] * H] as Pt }));
  const districtOf = (p: Pt): DistrictId => {
    let best = seeds[0]!, bd = Infinity;
    for (const s of seeds) {
      const d = Math.hypot(p[0] - s.p[0], p[1] - s.p[1]);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best.id;
  };
  const onLand = (p: Pt, margin: number) =>
    p[0] > margin && p[1] > margin && p[0] < W - margin && p[1] < H - margin && p[0] < coastXAt(coast, p[1]) - margin && distToPolyline(p, river) > riverWidth / 2 + margin;

  // ---- blocks & building footprints: one rotated street grid per district
  const blocks: AtlasBlock[] = [];
  const buildings: Atlas["buildings"] = [];
  const SX = 168, SY = 124, STREET = 26;
  for (const d of DISTRICTS) {
    const a = DISTRICT_META[d.id].angle;
    const ca = Math.cos(a), sa = Math.sin(a);
    const rot = (u: number, v: number): Pt => [u * ca - v * sa, u * sa + v * ca];
    const span = Math.hypot(W, H);
    for (let u = -span; u < span; u += SX) {
      for (let v = -span; v < span; v += SY) {
        const c = rot(u, v);
        if (c[0] < -SX || c[1] < -SY || c[0] > W + SX || c[1] > H + SY) continue;
        if (districtOf(c) !== d.id) continue;
        const nearCentral = Math.hypot(c[0] - central.center[0], c[1] - central.center[1]) < central.radius + 40;
        if (nearCentral || !onLand(c, 70)) continue;
        // occasional larger super-blocks and empty lots keep the grid from looking mechanical
        if (rnd() < 0.05) continue;
        const hw = (SX - STREET) / 2, hh = (SY - STREET) / 2;
        const corner = (du: number, dv: number) => rot(u + du, v + dv);
        const poly = [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)].flat();
        const park = rnd() < 0.07;
        blocks.push({ poly, district: d.id, park });
        if (park) continue;
        // split the block into 2–5 buildings along its long side
        const n = 2 + Math.floor(rnd() * 4);
        const rows = rnd() < 0.5 ? 1 : 2;
        const bw = (hw * 2) / n;
        for (let r = 0; r < rows; r++) {
          for (let i = 0; i < n; i++) {
            const gap = 5;
            const x0 = -hw + i * bw + gap, x1 = -hw + (i + 1) * bw - gap;
            const y0 = rows === 1 ? -hh + gap : r === 0 ? -hh + gap : gap / 2;
            const y1 = rows === 1 ? hh - gap : r === 0 ? -gap / 2 : hh - gap;
            const shrink = rnd() * 6;
            buildings.push({
              poly: [corner(x0 + shrink, y0 + shrink), corner(x1 - shrink, y0 + shrink), corner(x1 - shrink, y1 - shrink), corner(x0 + shrink, y1 - shrink)].flat(),
              shade: Math.floor(rnd() * 3),
              district: d.id,
            });
          }
        }
      }
    }
  }
  // central plaza: concentric ring of small blocks
  for (let ring = 0; ring < 2; ring++) {
    const r = 140 + ring * 95;
    const count = 8 + ring * 6;
    for (let i = 0; i < count; i++) {
      const t0 = (i / count) * Math.PI * 2 + 0.06, t1 = ((i + 1) / count) * Math.PI * 2 - 0.06;
      const r0 = r - 34, r1 = r + 34;
      const pt = (t: number, rr: number): Pt => [central.center[0] + Math.cos(t) * rr, central.center[1] + Math.sin(t) * rr];
      const poly = [pt(t0, r0), pt(t1, r0), pt(t1, r1), pt(t0, r1)].flat();
      if (!onLand([central.center[0] + Math.cos((t0 + t1) / 2) * r, central.center[1] + Math.sin((t0 + t1) / 2) * r], 0)) continue;
      blocks.push({ poly, district: "central", park: false });
      buildings.push({ poly: [pt(t0 + 0.02, r0 + 6), pt(t1 - 0.02, r0 + 6), pt(t1 - 0.02, r1 - 6), pt(t0 + 0.02, r1 - 6)].flat(), shade: 2, district: "central" });
    }
  }

  // ---- arterial roads: ring + radials + coastal road
  const arterials: Atlas["arterials"] = [];
  const ring: Pt[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    const r = 760 + Math.sin(t * 3) * 60;
    ring.push([central.center[0] + Math.cos(t) * r * 1.25, central.center[1] + Math.sin(t) * r * 0.9]);
  }
  arterials.push({ pts: ring, width: 30 });
  arterials.push({ pts: catmull([[central.center[0] - central.radius - 10, central.center[1]], [central.center[0], central.center[1] - central.radius - 10], [central.center[0] + central.radius + 10, central.center[1]], [central.center[0], central.center[1] + central.radius + 10], [central.center[0] - central.radius - 10, central.center[1]]], 10), width: 22 });
  const radialTargets: Pt[] = [
    [0, H * 0.18], [W * 0.18, -20], [W * 0.62, -20], [W * 0.84, H * 0.36], [W * 0.7, H + 20], [W * 0.38, H + 20], [-20, H * 0.62], [-20, H * 0.94],
  ];
  for (const tgt of radialTargets) {
    const start: Pt = [central.center[0], central.center[1]];
    const mid: Pt = [(start[0] + tgt[0]) / 2 + (rnd() - 0.5) * 380, (start[1] + tgt[1]) / 2 + (rnd() - 0.5) * 280];
    arterials.push({ pts: catmull([start, mid, tgt], 20), width: 26 });
  }
  arterials.push({ pts: coast.map(([x, y]) => [x - 90, y] as Pt), width: 22 });

  // ---- lots: marker anchor points per district (block centres, spaced, nearest the district heart first)
  const lots = {} as Record<DistrictId, Pt[]>;
  for (const d of DISTRICTS) {
    const seed = seeds.find((s) => s.id === d.id)!.p;
    const cands = blocks
      .filter((b) => b.district === d.id && !b.park)
      .map((b) => [(b.poly[0]! + b.poly[2]! + b.poly[4]! + b.poly[6]!) / 4, (b.poly[1]! + b.poly[3]! + b.poly[5]! + b.poly[7]!) / 4] as Pt)
      .filter((p) => onLand(p, 110))
      .sort((p, q) => Math.hypot(p[0] - seed[0], p[1] - seed[1]) - Math.hypot(q[0] - seed[0], q[1] - seed[1]));
    const picked: Pt[] = [];
    for (const c of cands) {
      if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) >= 200)) picked.push(c);
      if (picked.length >= 120) break;
    }
    lots[d.id] = picked;
  }

  const districts: AtlasDistrict[] = DISTRICTS.map((d) => {
    const s = seeds.find((x) => x.id === d.id)!.p;
    return { id: d.id, name: DISTRICT_META[d.id].name, caption: DISTRICT_META[d.id].caption, seed: s, label: [s[0], s[1] - 230] };
  });

  cached = { version: ATLAS_VERSION, width: W, height: H, coast, river, riverWidth, blocks, buildings, arterials, central, districts, lots };
  return cached;
}

/**
 * Normalized (0..1) marker position for the n-th Space in a district. Deterministic and stable.
 * Beyond a district's lot capacity, positions spiral around earlier lots (markers then cluster).
 */
export function lotPosition(districtId: DistrictId, plotIndex: number): { x: number; y: number } {
  const a = generateAtlas();
  const lots = a.lots[districtId];
  if (!lots || lots.length === 0) throw new Error(`no lots for ${districtId}`);
  let p = lots[plotIndex % lots.length]!;
  const lap = Math.floor(plotIndex / lots.length);
  if (lap > 0) {
    const t = lap * 2.399; // golden angle
    p = [p[0] + Math.cos(t) * 60 * Math.sqrt(lap), p[1] + Math.sin(t) * 60 * Math.sqrt(lap)];
  }
  return { x: p[0] / a.width, y: p[1] / a.height };
}

export function isOnLand(xNorm: number, yNorm: number): boolean {
  const a = generateAtlas();
  const p: Pt = [xNorm * a.width, yNorm * a.height];
  return p[0] < coastXAt(a.coast, p[1]) && distToPolyline(p, a.river) > a.riverWidth / 2;
}
