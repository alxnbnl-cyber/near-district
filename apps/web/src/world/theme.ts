/**
 * Map theme — the single place the renderer gets its look from.
 * To use a designed city artwork instead of the generated geometry, set `artwork` to a
 * PNG/SVG in public/ sized to ATLAS_W × ATLAS_H (4800 × 3200). Markers keep working because
 * they use normalized coordinates.
 */
export const MAP_THEME = {
  artwork: null as string | null,
  background: 0x090b10,
  land: 0x0f141c,
  blockByDistrict: {
    discovery: 0x1a2130,
    mystery: 0x1b1f2f,
    creators: 0x182230,
    community: 0x192231,
    central: 0x202a3b,
  } as Record<string, number>,
  park: 0x14231f,
  buildings: [0x252e40, 0x2a3447, 0x212a3a],
  centralBuilding: 0x2f3b51,
  water: 0x0c2133,
  waterEdge: 0x1a3f5c,
  road: 0x343f53,
  roadCenter: 0x465268,
  route: 0x32c8ef,
  routeDone: 0xff9138,
};
