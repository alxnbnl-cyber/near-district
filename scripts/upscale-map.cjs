/**
 * Pre-scales the map artwork 2x with Lanczos + gentle sharpening so the GPU barely magnifies it.
 * This makes edges crisper; it cannot invent detail. For true sharpness, feed an AI-upscaled image.
 *
 *   node scripts/upscale-map.cjs apps/web/public/assets/world/map-v1.webp apps/web/public/assets/world/map-v1@2x.webp
 */
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const sharpDir = fs.readdirSync(path.join(root, "node_modules/.pnpm")).find((d) => d.startsWith("sharp@"));
const sharp = require(path.join(root, "node_modules/.pnpm", sharpDir, "node_modules/sharp"));

const [src, dst] = process.argv.slice(2).map((p) => path.resolve(root, p));
(async () => {
  const meta = await sharp(src).metadata();
  await sharp(src)
    .resize(meta.width * 2, meta.height * 2, { kernel: "lanczos3" })
    .sharpen({ sigma: 1.1, m1: 0.6, m2: 2.2 })
    .webp({ quality: 90, effort: 6 })
    .toFile(dst);
  const out = await sharp(dst).metadata();
  console.log(`${path.basename(src)} ${meta.width}x${meta.height} → ${path.basename(dst)} ${out.width}x${out.height} (${Math.round(fs.statSync(dst).size / 1024)} KB)`);
})();
