/**
 * Map theme — game-map style: dark navy ground, slate city blocks with building footprints,
 * olive parks and islands, steel-blue river, deep navy sea. Orange is reserved for the selected
 * Space, cyan for routes. Replace the generated city with artwork via `artwork` (ATLAS_W × ATLAS_H).
 */
export const MAP_THEME = {
  artwork: "/assets/world/map-v1@2x.webp" as string | null,
  /** Pixel width of the ORIGINAL artwork (before any non-AI pre-scaling); limits zoom so it stays sharp. */
  artworkSourceWidth: 1536,
  background: 0x0a0f16,
  land: 0x10161f,
  block: 0x1b222d,
  buildings: [0x283140, 0x2e3848, 0x242c39],
  park: 0x2e3b26,
  parkEdge: 0x3a4a30,
  road: 0x2c3544,
  bridge: 0x4a5566,
  river: 0x1b4262,
  riverEdge: 0x2d6890,
  sea: 0x0e1e30,
  coastEdge: 0x24527a,
  island: 0x2b3824,
  pier: 0x262f3c,
  area: 0x9aa6ba,
  selected: 0xff9138,
  route: 0x32c8ef,
  routeDone: 0xff9138,
};
