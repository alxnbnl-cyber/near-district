/**
 * Procedural, original isometric art for the temporary world. Every shape is drawn once
 * into a shared GraphicsContext and reused by all instances (GPU geometry is cached), so
 * 500 buildings cost 6 style geometries, not 500.
 *
 * Replace any of this with sprite art via world/manifest.ts — nothing else references it.
 */
import { GraphicsContext } from "pixi.js";
import { TILE_H, TILE_W } from "@yielvy/core/world";

// ----------------------------------------------------------------------------- color

export function hexToRgb(hex: number) {
  return { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 };
}
export function mix(a: number, b: number, t: number): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const r = Math.round(x.r + (y.r - x.r) * t);
  const g = Math.round(x.g + (y.g - x.g) * t);
  const bl = Math.round(x.b + (y.b - x.b) * t);
  return (r << 16) | (g << 8) | bl;
}
export const shade = (c: number, t: number) => (t >= 0 ? mix(c, 0xffffff, t) : mix(c, 0x2a1e18, -t));

export const PALETTE = {
  ink: 0x22232b,
  paper: 0xfff9f0,
  grass: 0xdcebc1,
  grassAlt: 0xd2e4b2,
  grassDeep: 0xc4daa0,
  street: 0xf1e3c8,
  streetEdge: 0xe3cfaa,
  avenue: 0xedd9b8,
  avenueMark: 0xf9efdc,
  plaza: 0xf5e8d0,
  plazaTile: 0xebdabb,
  wall: 0xf7ebd6,
  wallWarm: 0xf3dfc2,
  wood: 0xa8754f,
  window: 0x30344a,
  windowLit: 0xffd66e,
  shadow: 0x5b4528,
  water: 0x8fd3ea,
  orange: 0xff914d,
};

export type ThemeKey = "orange" | "violet" | "mint" | "sky";
export const THEMES: Record<ThemeKey, { roofs: number[]; pad: number; accent: number }> = {
  orange: { roofs: [0xef7f45, 0xe99a52, 0xd9684a], pad: 0xf9dcc6, accent: 0xff914d },
  violet: { roofs: [0x8a78c2, 0x6f68a6, 0xa18dce], pad: 0xe4ddf2, accent: 0xa394d6 },
  mint: { roofs: [0x58b08f, 0x76c3a4, 0x47978a], pad: 0xd6eee2, accent: 0x9bd7bf },
  sky: { roofs: [0x55acd2, 0x74c0dc, 0x4590bc], pad: 0xd7edf6, accent: 0x74c9e6 },
};

// ----------------------------------------------------------------------------- geometry

type P = [number, number];
const flat = (pts: P[]) => pts.flat();

/** Footprint half extents for an N-tile square footprint. */
export function footprint(tiles: number, inset = 1) {
  return { w: (tiles * TILE_W) / 2 * inset, h: (tiles * TILE_H) / 2 * inset };
}

interface Box {
  N: P; E: P; S: P; W: P;
  Nt: P; Et: P; St: P; Wt: P;
  H: number;
}
function box(w: number, h: number, H: number, oy = 0): Box {
  const N: P = [0, -h + oy], E: P = [w, oy], S: P = [0, h + oy], W: P = [-w, oy];
  const up = (p: P): P => [p[0], p[1] - H];
  return { N, E, S, W, Nt: up(N), Et: up(E), St: up(S), Wt: up(W), H };
}

/** Point on the left (W→S) face: u along the face, v up the wall (0..1). */
const leftFace = (b: Box, u: number, v: number): P => [b.W[0] + (b.S[0] - b.W[0]) * u, b.W[1] + (b.S[1] - b.W[1]) * u - b.H * v];
/** Point on the right (S→E) face. */
const rightFace = (b: Box, u: number, v: number): P => [b.S[0] + (b.E[0] - b.S[0]) * u, b.S[1] + (b.E[1] - b.S[1]) * u - b.H * v];

function faceRect(face: (b: Box, u: number, v: number) => P, b: Box, u0: number, u1: number, v0: number, v1: number): number[] {
  return flat([face(b, u0, v0), face(b, u1, v0), face(b, u1, v1), face(b, u0, v1)]);
}

function drawBox(g: GraphicsContext, b: Box, wall: number) {
  g.poly(flat([b.W, b.S, b.St, b.Wt])).fill(shade(wall, -0.04));
  g.poly(flat([b.S, b.E, b.Et, b.St])).fill(shade(wall, -0.16));
  g.poly(flat([b.Nt, b.Et, b.St, b.Wt])).fill(shade(wall, 0.25));
  // crisp edge lines
  g.poly(flat([b.Wt, b.St, b.Et])).stroke({ width: 1.5, color: shade(wall, -0.3), alpha: 0.35 });
  g.moveTo(b.St[0], b.St[1]).lineTo(b.S[0], b.S[1]).stroke({ width: 1.5, color: shade(wall, -0.3), alpha: 0.3 });
}

function windows(g: GraphicsContext, b: Box, rows: number, cols: number, lit: (i: number) => boolean, opts: { v0?: number; v1?: number; skipDoor?: boolean } = {}) {
  const v0 = opts.v0 ?? 0.38, v1 = opts.v1 ?? 0.86;
  let i = 0;
  for (const [face, side] of [[leftFace, "L"], [rightFace, "R"]] as const) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (opts.skipDoor && side === "L" && r === 0 && c === Math.floor(cols / 2)) {
          i++;
          continue;
        }
        const du = 1 / cols, dv = (v1 - v0) / rows;
        const u0 = c * du + du * 0.26, u1 = (c + 1) * du - du * 0.26;
        const vv0 = v0 + r * dv + dv * 0.18, vv1 = v0 + (r + 1) * dv - dv * 0.12;
        const isLit = lit(i++);
        g.poly(faceRect(face, b, u0, u1, vv0, vv1)).fill(isLit ? PALETTE.windowLit : side === "L" ? 0x3a3f57 : 0x2c3044);
      }
    }
  }
}

function door(g: GraphicsContext, b: Box, color: number) {
  g.poly(faceRect(leftFace, b, 0.42, 0.58, 0, 0.3)).fill(color);
  g.poly(faceRect(leftFace, b, 0.39, 0.61, 0.3, 0.34)).fill(shade(color, -0.25));
}

function groundShadow(g: GraphicsContext, w: number, h: number) {
  g.poly(flat([[0, -h * 0.9], [w * 1.08, h * 0.12], [w * 0.1, h * 1.12], [-w * 0.98, h * 0.06]])).fill({ color: PALETTE.shadow, alpha: 0.13 });
}

function pad(g: GraphicsContext, theme: ThemeKey) {
  const f = footprint(3, 0.94);
  g.poly(flat([[0, -f.h], [f.w, 0], [0, f.h], [-f.w, 0]])).fill(THEMES[theme].pad);
  g.poly(flat([[0, -f.h], [f.w, 0], [0, f.h], [-f.w, 0]])).stroke({ width: 2, color: shade(THEMES[theme].pad, -0.12), alpha: 0.8 });
  // small garden corners
  for (const [x, y] of [[-f.w * 0.72, 0], [f.w * 0.72, 0]] as P[]) {
    g.ellipse(x, y - 4, 16, 9).fill(0xa9cf86);
    g.ellipse(x - 3, y - 9, 10, 7).fill(0xbfdc98);
  }
}

// ----------------------------------------------------------------------------- building styles

export const BUILDING_STYLES = ["workshop", "tower", "market", "atelier", "observatory", "pavilion"] as const;
export type BuildingStyle = (typeof BUILDING_STYLES)[number];
export const BUILDING_STYLE_LABELS: Record<BuildingStyle, string> = {
  workshop: "Workshop",
  tower: "Tower",
  market: "Market hall",
  atelier: "Atelier",
  observatory: "Observatory",
  pavilion: "Pavilion",
};

/** Height of each style's roofline above ground, used to place badges and labels. */
export const STYLE_TOP: Record<BuildingStyle, number> = {
  workshop: 250,
  tower: 360,
  market: 210,
  atelier: 250,
  observatory: 300,
  pavilion: 215,
};

const cache = new Map<string, GraphicsContext>();

export function buildingContext(style: BuildingStyle, theme: ThemeKey, variant: number): GraphicsContext {
  const key = `${style}:${theme}:${variant % 3}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new GraphicsContext();
  const roof = THEMES[theme].roofs[variant % 3]!;
  const accent = THEMES[theme].accent;
  const fp = footprint(3, 0.66);
  pad(g, theme);
  groundShadow(g, fp.w, fp.h);
  const lit = (i: number) => (i * 7 + variant * 3) % 5 === 0;

  switch (style) {
    case "workshop": {
      const b = box(fp.w, fp.h, 105);
      drawBox(g, b, PALETTE.wall);
      windows(g, b, 1, 3, lit, { skipDoor: true });
      door(g, b, PALETTE.wood);
      pyramidRoof(g, b, 95, roof);
      chimney(g, b, roof);
      break;
    }
    case "tower": {
      const base = box(fp.w * 0.92, fp.h * 0.92, 70);
      drawBox(g, base, PALETTE.wallWarm);
      door(g, base, PALETTE.wood);
      const t = box(fp.w * 0.62, fp.h * 0.62, 190, -70);
      drawBox(g, t, PALETTE.wall);
      windows(g, t, 3, 2, lit, { v0: 0.12, v1: 0.92 });
      parapet(g, t, roof);
      // antenna + beacon
      const topY = (t.Nt[1] + t.St[1]) / 2 - 12;
      g.rect(-2, topY - 44, 4, 44).fill(PALETTE.ink);
      g.circle(0, topY - 46, 6).fill(accent);
      break;
    }
    case "market": {
      const b = box(fp.w, fp.h, 92);
      drawBox(g, b, PALETTE.wallWarm);
      windows(g, b, 1, 3, lit, { v0: 0.18, v1: 0.6, skipDoor: true });
      door(g, b, shade(roof, -0.3));
      awning(g, b, roof);
      flatRoof(g, b, shade(roof, 0.35));
      crates(g, b);
      break;
    }
    case "atelier": {
      const b = box(fp.w, fp.h, 110);
      drawBox(g, b, PALETTE.wall);
      windows(g, b, 2, 2, lit, { v0: 0.14, v1: 0.9 });
      gableRoof(g, b, 92, roof);
      skylight(g, b);
      break;
    }
    case "observatory": {
      const b = box(fp.w * 0.95, fp.h * 0.95, 98);
      drawBox(g, b, PALETTE.wallWarm);
      windows(g, b, 1, 4, lit, { v0: 0.4, v1: 0.8, skipDoor: true });
      door(g, b, PALETTE.wood);
      flatRoof(g, b, shade(PALETTE.wallWarm, 0.3));
      dome(g, b, roof);
      break;
    }
    case "pavilion": {
      const b = box(fp.w * 1.05, fp.h * 1.05, 86);
      drawBox(g, b, PALETTE.wall);
      columns(g, b);
      windows(g, b, 1, 4, lit, { v0: 0.3, v1: 0.72, skipDoor: true });
      door(g, b, PALETTE.wood);
      gableRoof(g, b, 70, roof);
      break;
    }
  }
  cache.set(key, g);
  return g;
}

function pyramidRoof(g: GraphicsContext, b: Box, rh: number, color: number) {
  const o = 10; // overhang
  const W: P = [b.Wt[0] - o, b.Wt[1]], S: P = [b.St[0], b.St[1] + o / 2], E: P = [b.Et[0] + o, b.Et[1]], N: P = [b.Nt[0], b.Nt[1] - o / 2];
  const A: P = [0, (b.Nt[1] + b.St[1]) / 2 - rh];
  g.poly(flat([N, W, A])).fill(shade(color, 0.12));
  g.poly(flat([E, N, A])).fill(shade(color, -0.05));
  g.poly(flat([W, S, A])).fill(color);
  g.poly(flat([S, E, A])).fill(shade(color, -0.2));
  g.poly(flat([W, S, E])).stroke({ width: 2, color: shade(color, -0.35), alpha: 0.5 });
}

function gableRoof(g: GraphicsContext, b: Box, rh: number, color: number) {
  const mid = (a: P, c: P): P => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  const M1 = mid(b.Nt, b.Wt), M2 = mid(b.Et, b.St);
  const R1: P = [M1[0], M1[1] - rh], R2: P = [M2[0], M2[1] - rh];
  g.poly(flat([b.Nt, R1, R2, b.Et])).fill(shade(color, 0.1));
  g.poly(flat([R1, b.Wt, b.St, R2])).fill(color);
  // front gable end (wall colour) with round window
  g.poly(flat([b.St, b.Et, R2])).fill(shade(PALETTE.wall, -0.14));
  const c: P = [(b.St[0] + b.Et[0] + R2[0]) / 3, (b.St[1] + b.Et[1] + R2[1]) / 3];
  g.ellipse(c[0], c[1], 10, 12).fill(PALETTE.window);
  g.moveTo(R1[0], R1[1]).lineTo(R2[0], R2[1]).stroke({ width: 3, color: shade(color, -0.35) });
  g.poly(flat([b.Wt, b.St, b.Et])).stroke({ width: 2, color: shade(color, -0.35), alpha: 0.45 });
}

function flatRoof(g: GraphicsContext, b: Box, color: number) {
  const C: P = [0, (b.Nt[1] + b.St[1]) / 2];
  const t = (p: P): P => [C[0] + (p[0] - C[0]) * 0.82, C[1] + (p[1] - C[1]) * 0.82];
  g.poly(flat([t(b.Nt), t(b.Et), t(b.St), t(b.Wt)])).fill(color);
}

function parapet(g: GraphicsContext, b: Box, color: number) {
  const lip = 12;
  g.poly(flat([b.Wt, b.St, [b.St[0], b.St[1] - lip], [b.Wt[0], b.Wt[1] - lip]])).fill(color);
  g.poly(flat([b.St, b.Et, [b.Et[0], b.Et[1] - lip], [b.St[0], b.St[1] - lip]])).fill(shade(color, -0.18));
  g.poly(flat([[b.Nt[0], b.Nt[1] - lip], [b.Et[0], b.Et[1] - lip], [b.St[0], b.St[1] - lip], [b.Wt[0], b.Wt[1] - lip]])).fill(shade(color, 0.3));
  const k = 0.7;
  g.poly(flat([[b.Nt[0], b.Nt[1] - lip + 6], [b.Et[0] * k, (b.Et[1] - lip) ], [b.St[0], b.St[1] - lip - 6], [b.Wt[0] * k, b.Wt[1] - lip]])).fill(shade(color, 0.05));
}

function chimney(g: GraphicsContext, b: Box, roof: number) {
  const x = b.Et[0] * 0.38, y = b.Et[1] - 60;
  g.poly(flat([[x - 9, y], [x, y + 5], [x, y - 36], [x - 9, y - 41]])).fill(shade(PALETTE.wallWarm, -0.1));
  g.poly(flat([[x, y + 5], [x + 9, y], [x + 9, y - 41], [x, y - 36]])).fill(shade(PALETTE.wallWarm, -0.25));
  g.poly(flat([[x - 9, y - 41], [x, y - 36], [x + 9, y - 41], [x, y - 46]])).fill(shade(roof, -0.4));
}

function awning(g: GraphicsContext, b: Box, color: number) {
  const stripes = 6;
  for (let i = 0; i < stripes; i++) {
    const u0 = i / stripes, u1 = (i + 1) / stripes;
    const a = leftFace(b, u0, 0.66), c = leftFace(b, u1, 0.66);
    const a2: P = [a[0] - 16, a[1] + 22], c2: P = [c[0] - 16, c[1] + 22];
    g.poly(flat([a, c, c2, a2])).fill(i % 2 ? PALETTE.paper : color);
  }
  for (let i = 0; i < stripes; i++) {
    const u0 = i / stripes, u1 = (i + 1) / stripes;
    const a = rightFace(b, u0, 0.66), c = rightFace(b, u1, 0.66);
    const a2: P = [a[0] + 16, a[1] + 22], c2: P = [c[0] + 16, c[1] + 22];
    g.poly(flat([a, c, c2, a2])).fill(i % 2 ? shade(PALETTE.paper, -0.12) : shade(color, -0.16));
  }
}

function crates(g: GraphicsContext, b: Box) {
  const base = leftFace(b, 0.15, 0);
  const s = 12;
  g.poly(flat([[base[0] - s, base[1] + 18], [base[0], base[1] + 24], [base[0], base[1] + 10], [base[0] - s, base[1] + 4]])).fill(0xc99a6b);
  g.poly(flat([[base[0], base[1] + 24], [base[0] + s, base[1] + 18], [base[0] + s, base[1] + 4], [base[0], base[1] + 10]])).fill(0xb08155);
  g.poly(flat([[base[0] - s, base[1] + 4], [base[0], base[1] + 10], [base[0] + s, base[1] + 4], [base[0], base[1] - 2]])).fill(0xdcb385);
  g.circle(base[0] - 2, base[1] - 4, 5).fill(0xff914d);
  g.circle(base[0] + 5, base[1] - 2, 4.5).fill(0xffd66e);
}

function skylight(g: GraphicsContext, b: Box) {
  const c: P = [(b.Wt[0] + b.St[0]) / 2, (b.Wt[1] + b.St[1]) / 2 - 36];
  g.poly(flat([[c[0] - 22, c[1]], [c[0], c[1] + 11], [c[0] + 22, c[1]], [c[0], c[1] - 11]])).fill(0x9fd6ea);
  g.poly(flat([[c[0] - 22, c[1]], [c[0], c[1] + 11], [c[0] + 22, c[1]], [c[0], c[1] - 11]])).stroke({ width: 2, color: 0xffffff, alpha: 0.7 });
}

function dome(g: GraphicsContext, b: Box, color: number) {
  const cy = (b.Nt[1] + b.St[1]) / 2;
  const r = b.Et[0] * 0.55;
  g.ellipse(0, cy, r, r * 0.5).fill(shade(color, -0.25));
  g.moveTo(-r, cy).arc(0, cy, r, Math.PI, 0).fill(color);
  g.moveTo(-r * 0.15, cy).arc(0, cy, r, Math.PI * 1.42, Math.PI * 1.58).fill(shade(color, 0.3));
  // telescope slit
  g.poly(flat([[-6, cy - r * 0.96], [6, cy - r * 0.96], [10, cy - 6], [-10, cy - 6]])).fill(PALETTE.window);
  g.circle(0, cy - r - 6, 5).fill(PALETTE.windowLit);
}

function columns(g: GraphicsContext, b: Box) {
  for (const u of [0.08, 0.92]) {
    const a = leftFace(b, u, 0), c = leftFace(b, u, 1);
    g.rect(a[0] - 5, c[1], 10, a[1] - c[1]).fill(shade(PALETTE.wall, 0.15));
    const d = rightFace(b, u, 0), e = rightFace(b, u, 1);
    g.rect(d[0] - 5, e[1], 10, d[1] - e[1]).fill(shade(PALETTE.wall, -0.05));
  }
}

// ----------------------------------------------------------------------------- decorations

export function treeContext(kind: "round" | "pine" | "bush", variant: number): GraphicsContext {
  const key = `tree:${kind}:${variant % 3}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new GraphicsContext();
  const greens = [0x7fbf6a, 0x6aae63, 0x93c979];
  const c = greens[variant % 3]!;
  g.ellipse(4, 2, 22, 10).fill({ color: PALETTE.shadow, alpha: 0.14 });
  if (kind === "bush") {
    g.ellipse(0, -10, 20, 14).fill(shade(c, -0.08));
    g.ellipse(-6, -16, 12, 10).fill(shade(c, 0.12));
  } else if (kind === "pine") {
    g.rect(-3, -14, 6, 14).fill(PALETTE.wood);
    for (let i = 0; i < 3; i++) {
      const y = -14 - i * 18, w = 22 - i * 5;
      g.poly([-w, y, w, y, 0, y - 30]).fill(i % 2 ? shade(c, -0.15) : shade(c, -0.05));
    }
  } else {
    g.rect(-3.5, -20, 7, 20).fill(PALETTE.wood);
    g.circle(0, -38, 22).fill(shade(c, -0.08));
    g.circle(-7, -44, 13).fill(shade(c, 0.12));
    g.circle(8, -34, 10).fill(shade(c, -0.18));
  }
  cache.set(key, g);
  return g;
}

export function lampContext(): GraphicsContext {
  const hit = cache.get("lamp");
  if (hit) return hit;
  const g = new GraphicsContext();
  g.ellipse(0, 0, 8, 4).fill({ color: PALETTE.shadow, alpha: 0.18 });
  g.rect(-2, -54, 4, 54).fill(PALETTE.ink);
  g.roundRect(-7, -66, 14, 13, 3).fill(PALETTE.ink);
  g.roundRect(-5, -64, 10, 9, 2).fill(PALETTE.windowLit);
  cache.set("lamp", g);
  return g;
}

export function lampGlowContext(): GraphicsContext {
  const hit = cache.get("lampGlow");
  if (hit) return hit;
  const g = new GraphicsContext();
  g.circle(0, -60, 22).fill({ color: PALETTE.windowLit, alpha: 0.16 });
  g.circle(0, -60, 12).fill({ color: PALETTE.windowLit, alpha: 0.22 });
  cache.set("lampGlow", g);
  return g;
}

export function benchContext(): GraphicsContext {
  const hit = cache.get("bench");
  if (hit) return hit;
  const g = new GraphicsContext();
  g.poly([-18, -6, 4, 5, 18, -2, -4, -13]).fill(0xb98557);
  g.poly([-18, -6, -18, -14, -4, -21, -4, -13]).fill(0xa06f45);
  g.rect(-14, -6, 3, 8).fill(PALETTE.ink);
  g.rect(12, -4, 3, 8).fill(PALETTE.ink);
  cache.set("bench", g);
  return g;
}

/** "Open plot" stake sign — an honest invitation where no Space exists yet. */
export function openPlotContext(theme: ThemeKey): GraphicsContext {
  const key = `open:${theme}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new GraphicsContext();
  const f = footprint(3, 0.9);
  const dash = 14;
  const pts: P[] = [[0, -f.h], [f.w, 0], [0, f.h], [-f.w, 0], [0, -f.h]];
  for (let i = 0; i < 4; i++) {
    const [a, b] = [pts[i]!, pts[i + 1]!];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = 0; d < len; d += dash * 2) {
      const t0 = d / len, t1 = Math.min(1, (d + dash) / len);
      g.moveTo(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0)
        .lineTo(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)
        .stroke({ width: 3, color: shade(THEMES[theme].pad, -0.25), alpha: 0.9 });
    }
  }
  g.rect(-3, -48, 6, 50).fill(PALETTE.wood);
  g.roundRect(-58, -88, 116, 44, 8).fill(PALETTE.paper);
  g.roundRect(-58, -88, 116, 44, 8).stroke({ width: 3, color: THEMES[theme].accent });
  g.circle(-44, -66, 6).fill(THEMES[theme].accent);
  cache.set(key, g);
  return g;
}

export function fountainContext(): GraphicsContext {
  const hit = cache.get("fountain");
  if (hit) return hit;
  const g = new GraphicsContext();
  const ring = (rx: number, ry: number, y: number, c: number) => g.ellipse(0, y, rx, ry).fill(c);
  ring(150, 75, 8, shade(PALETTE.plazaTile, -0.15));
  ring(140, 70, 0, 0xe6d2ae);
  ring(122, 61, 0, PALETTE.water);
  ring(100, 50, -2, shade(PALETTE.water, 0.18));
  g.rect(-14, -70, 28, 70).fill(0xe8d6b4);
  g.rect(0, -70, 14, 70).fill(0xd8c29b);
  ring(46, 23, -70, 0xe6d2ae);
  ring(38, 19, -72, PALETTE.water);
  cache.set("fountain", g);
  return g;
}

export function signpostContext(theme: ThemeKey): GraphicsContext {
  const key = `signpost:${theme}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new GraphicsContext();
  g.ellipse(0, 0, 18, 8).fill({ color: PALETTE.shadow, alpha: 0.15 });
  g.rect(-4, -120, 8, 120).fill(PALETTE.wood);
  g.roundRect(-90, -150, 180, 44, 8).fill(PALETTE.paper);
  g.roundRect(-90, -150, 180, 44, 8).stroke({ width: 3, color: THEMES[theme].accent });
  g.circle(-72, -128, 7).fill(THEMES[theme].accent);
  cache.set(key, g);
  return g;
}

export function walkerContext(color: number): GraphicsContext {
  const key = `walker:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new GraphicsContext();
  g.ellipse(0, 0, 9, 4).fill({ color: PALETTE.shadow, alpha: 0.2 });
  g.roundRect(-6, -26, 12, 22, 6).fill(color);
  g.circle(0, -32, 6.5).fill(0xf2c9a0);
  cache.set(key, g);
  return g;
}

export function cloudContext(): GraphicsContext {
  const hit = cache.get("cloud");
  if (hit) return hit;
  const g = new GraphicsContext();
  for (const [x, y, r] of [[0, 0, 70], [70, 12, 55], [-70, 14, 50], [30, -24, 50]] as const) g.circle(x, y, r).fill({ color: 0xffffff, alpha: 0.75 });
  cache.set("cloud", g);
  return g;
}

export function cloudShadowContext(): GraphicsContext {
  const hit = cache.get("cloudShadow");
  if (hit) return hit;
  const g = new GraphicsContext();
  g.ellipse(0, 0, 220, 90).fill({ color: 0x6a8a5a, alpha: 0.06 });
  cache.set("cloudShadow", g);
  return g;
}

export const WALKER_COLORS = [0xff914d, 0x74c9e6, 0x9bd7bf, 0xa394d6, 0xffd66e, 0x22232b];
