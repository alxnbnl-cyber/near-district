# World art pipeline

All world art is resolved through `apps/web/src/world/manifest.ts`. Today every entry is `procedural` (original vector drawings in `world/art.ts`). To use commissioned art, change an entry to a sprite — no renderer changes.

## Specs
- Isometric tile: **128 × 64 px** (2:1 dimetric). Building footprint: **3 × 3 tiles = 384 × 192 px** diamond.
- Building sprite canvas: **512 × 512 px** at 1×, plus **@2x** (1024 × 1024). Anchor = footprint centre on the ground (e.g. `[0.5, 0.86]`).
- Max height above ground: 380 px (badges sit above `STYLE_TOP`).
- Trees/props: 128 × 160 px canvases, anchor at the trunk base.
- Format: PNG-24 with alpha (or WebP lossless). Run through `oxipng -o4` / `cwebp -lossless`.
- Colour: sRGB, match the palette in `globals.css`; avoid baked drop shadows (the renderer draws ground shadows).

## Atlases
Pack with TexturePacker / free-tex-packer into ≤ 2048 × 2048 sheets, JSON-hash format:
`public/assets/world/atlas-buildings@2x.json` → reference frames as `"src": "/assets/world/atlas-buildings@2x.json#workshop.png"`.

## Animation
Optional `frames` + `fps` (≤ 12 fps, ≤ 8 frames). Animation runs only for on-screen objects and is disabled under reduced motion.

## Naming
`<kind>_<name>[_<variant>]@<scale>.png`, e.g. `building_workshop_orange@2x.png`, `deco_tree_round_2@2x.png`.

## Replaceable elsewhere
Brand wordmark: `components/brand/Logo.tsx`. Favicon: `public/assets/brand/favicon.svg`. Space logos, banners and campaign covers are organizer uploads.
