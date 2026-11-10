/**
 * Finds vault pin spots on a map artwork: dry land, next to a road, never in water, evenly spaced.
 * Writes normalized positions to packages/core/src/world/artwork-lots.json and a debug overlay PNG.
 *
 *   node scripts/map-lots.cjs apps/web/public/assets/world/map-v1.webp
 */
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const sharpDir = fs.readdirSync(path.join(root, "node_modules/.pnpm")).find((d) => d.startsWith("sharp@"));
const sharp = require(path.join(root, "node_modules/.pnpm", sharpDir, "node_modules/sharp"));

const input = path.resolve(root, process.argv[2] ?? "apps/web/public/assets/world/map-v1.webp");
const OUT = path.join(root, "packages/core/src/world/artwork-lots.json");
const DEBUG = path.join(root, "scripts/.map-lots-debug.png");
const ATLAS_W = 9000; // world units (3:2), must match packages/core/src/world/atlas.ts
const MIN_SPACING = 430; // world units between pins

(async () => {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const lum = new Float32Array(N), tealish = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    tealish[i] = b - r >= 12 && r < 24 ? 1 : 0;
  }
  // integral images for local mean / variance
  const S = new Float64Array((W + 1) * (H + 1)), S2 = new Float64Array((W + 1) * (H + 1)), R = new Float64Array((W + 1) * (H + 1));
  const road = new Uint8Array(N);
  for (let i = 0; i < N; i++) road[i] = lum[i] > 72 ? 1 : 0;
  for (let y = 0; y < H; y++) {
    let a = 0, a2 = 0, ar = 0;
    for (let x = 0; x < W; x++) {
      const v = lum[y * W + x];
      a += v; a2 += v * v; ar += road[y * W + x];
      const k = (y + 1) * (W + 1) + (x + 1);
      S[k] = S[k - W - 1] + a; S2[k] = S2[k - W - 1] + a2; R[k] = R[k - W - 1] + ar;
    }
  }
  const box = (I, x0, y0, x1, y1) => {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
    return I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
  };
  const r = 5;
  const water = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = (Math.min(W, x + r) - Math.max(0, x - r)) * (Math.min(H, y + r) - Math.max(0, y - r));
      const m = box(S, x - r, y - r, x + r, y + r) / n;
      const v = box(S2, x - r, y - r, x + r, y + r) / n - m * m;
      const i = y * W + x;
      // water: dark, teal-tinted and smooth
      water[i] = m < 30 && v < 22 && tealish[i] ? 1 : 0;
    }
  // grow water by a margin so pins keep off shorelines
  const margin = 14;
  const W2 = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let a = 0;
    for (let x = 0; x < W; x++) {
      a += water[y * W + x];
      const k = (y + 1) * (W + 1) + (x + 1);
      W2[k] = W2[k - W - 1] + a;
    }
  }
  const cands = [];
  for (let y = 12; y < H - 12; y += 2)
    for (let x = 12; x < W - 12; x += 2) {
      const i = y * W + x;
      if (road[i]) continue; // not on the road itself
      if (box(W2, x - margin, y - margin, x + margin, y + margin) > 0) continue; // near water
      const roadsNear = box(R, x - 7, y - 7, x + 7, y + 7);
      if (roadsNear < 6) continue; // must sit next to a road (keeps pins off empty hills)
      const busy = box(R, x - 14, y - 14, x + 14, y + 14);
      cands.push({ x, y, score: roadsNear + busy * 0.15 + Math.random() * 4 });
    }
  // greedy spacing, best-scored first, then shuffle so groups interleave across the map
  cands.sort((a, b) => b.score - a.score);
  const minPx = (MIN_SPACING / ATLAS_W) * W;
  const picked = [];
  for (const c of cands) if (picked.every((p) => (p.x - c.x) ** 2 + (p.y - c.y) ** 2 >= minPx * minPx)) picked.push(c);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  const lots = picked.map((p) => [+(p.x / W).toFixed(5), +(p.y / H).toFixed(5)]);
  fs.writeFileSync(OUT, JSON.stringify({ source: path.basename(input), width: W, height: H, lots }, null, 0) + "\n");

  // debug overlay: water tinted red, pins as orange dots
  const dbg = Buffer.from(data);
  for (let i = 0; i < N; i++) if (water[i]) dbg[i * 3] = Math.min(255, dbg[i * 3] + 90);
  for (const p of picked)
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        if (dx * dx + dy * dy > 16) continue;
        const i = (p.y + dy) * W + (p.x + dx);
        dbg[i * 3] = 255; dbg[i * 3 + 1] = 145; dbg[i * 3 + 2] = 56;
      }
  await sharp(dbg, { raw: { width: W, height: H, channels: 3 } }).png().toFile(DEBUG);
  console.log(`candidates ${cands.length}, lots ${lots.length} → ${path.relative(root, OUT)}; debug ${path.relative(root, DEBUG)}`);
})();
