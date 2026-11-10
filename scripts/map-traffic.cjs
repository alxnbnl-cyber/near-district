/**
 * Traces short "traffic" paths along the roads of the map artwork, for the ambient cars layer.
 * Roads are the bright strokes of the painting; a walker follows them, preferring to go straight.
 * Writes normalized polylines to apps/web/src/world/traffic-paths.json.
 *
 *   node scripts/map-traffic.cjs [apps/web/public/assets/world/map-v1.webp]
 */
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const sharpDir = fs.readdirSync(path.join(root, "node_modules/.pnpm")).find((d) => d.startsWith("sharp@"));
const sharp = require(path.join(root, "node_modules/.pnpm", sharpDir, "node_modules/sharp"));

const input = path.resolve(root, process.argv[2] ?? "apps/web/public/assets/world/map-v1.webp");
const OUT = path.join(root, "apps/web/src/world/traffic-paths.json");
const PATHS = 70;
const STEP = 3; // px per walker step

(async () => {
  const { data, info } = await sharp(input).removeAlpha().greyscale().blur(1.2).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const at = (x, y) => (x < 2 || y < 2 || x >= W - 2 || y >= H - 2 ? 0 : data[(y | 0) * W + (x | 0)]);
  const ROAD = 50;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dirs = Array.from({ length: 16 }, (_, i) => [Math.cos((i / 16) * Math.PI * 2), Math.sin((i / 16) * Math.PI * 2)]);
  const out = [];
  let tries = 0;
  while (out.length < PATHS && tries++ < 20000) {
    let x = 20 + rnd() * (W - 40), y = 20 + rnd() * (H - 40);
    if (at(x, y) < 60) continue; // start on a clearly bright road
    let d = Math.floor(rnd() * 16);
    const pts = [[x, y]];
    for (let s = 0; s < 260; s++) {
      // look ahead in a ±45° cone; prefer straight, bright (road centre)
      let best = -1, bestScore = -1;
      for (const k of [0, 1, -1, 2, -2]) {
        const dd = (d + k + 16) % 16;
        const [dx, dy] = dirs[dd];
        const v = at(x + dx * STEP * 2, y + dy * STEP * 2);
        if (v < ROAD) continue;
        const score = v - Math.abs(k) * 9;
        if (score > bestScore) (bestScore = score), (best = dd);
      }
      if (best < 0) break;
      d = best;
      x += dirs[d][0] * STEP;
      y += dirs[d][1] * STEP;
      if (s % 3 === 2) pts.push([x, y]);
    }
    if (pts.length < 30) continue;
    // skip paths that mostly overlap an existing one
    const mid = pts[pts.length >> 1];
    if (out.some((p) => p.some(([px, py]) => (px - mid[0]) ** 2 + (py - mid[1]) ** 2 < 400))) continue;
    out.push(pts);
  }
  const norm = out.map((p) => p.map(([x, y]) => [+(x / W).toFixed(4), +(y / H).toFixed(4)]));
  fs.writeFileSync(OUT, JSON.stringify(norm) + "\n");
  console.log(`${norm.length} paths → ${path.relative(root, OUT)}`);
})();
