# World map & art pipeline

The explorer map is a dark, flat, top-down 2D fictional city ("Yielvy City").

## How it works
- `packages/core/src/world/atlas.ts` generates the city deterministically (seeded): coastline, river, curved arterials, a rotated street grid per district, building footprints and **lots** (marker anchor points). Same output everywhere, `ATLAS_VERSION = 1`.
- A Space's marker position = `lotPosition(district, plotIndex)` → normalized `(x, y)` in 0..1. Stable across sessions and screen sizes; computed on the server and sent to the client.
- `apps/web/src/world/atlas-scene.ts` (PixiJS) draws the city as cached GPU geometry and owns the camera.
- `apps/web/src/components/explore/MarkerLayer.tsx` renders HTML markers that follow the camera via CSS variables (no React re-render while panning), with clustering when zoomed out.
- Routes (cross-Space adventures) are drawn by the scene from `WorldData.routes`; the list is empty until that feature ships.

## Replacing the map with designed artwork
Set `MAP_THEME.artwork` in `apps/web/src/world/theme.ts` to an image in `public/` sized **4800 × 3200** (PNG/WebP, or a flattened SVG). Keep the coastline/river roughly where the generator puts them, or regenerate lots to match — markers use normalized coordinates, so nothing else changes. Colours of the generated map are all in the same theme file.

## Marker art
Markers show the Space's uploaded logo (square PNG/JPEG/WebP, ≥128 px). Experience badges (treasure hunt, contest, upcoming) are inline SVG icons in `components/explore/icons.tsx`.

## Changing the city
Bumping `ATLAS_VERSION` moves every existing Space. Do it only with a migration that pins current positions (e.g. store `map_x/map_y` on `world_buildings` before switching).
