/**
 * World asset manifest — the ONLY place the renderer looks up art.
 *
 * Each key resolves either to a built-in procedural drawing or to a sprite. To swap in
 * commissioned art, change an entry to { kind: "sprite", src, anchor } and drop the file in
 * public/assets/world/. No renderer code changes are needed. See docs/assets/world-art.md for
 * sizes (isometric tile 128x64, 3x3 building footprint 384x192), atlases and naming.
 */
export type AssetEntry =
  | { kind: "procedural" }
  | {
      kind: "sprite";
      /** Single image or a frame from a spritesheet atlas: "atlas.json#frame.png". */
      src: string;
      /** Normalized anchor; for buildings, the footprint centre on the ground. */
      anchor: [number, number];
      scale?: number;
      /** Optional animation frames from the same atlas. */
      frames?: string[];
      fps?: number;
    };

export const WORLD_ASSETS = {
  version: 1,
  buildings: {
    workshop: { kind: "procedural" },
    tower: { kind: "procedural" },
    market: { kind: "procedural" },
    atelier: { kind: "procedural" },
    observatory: { kind: "procedural" },
    pavilion: { kind: "procedural" },
  },
  decorations: {
    tree_round: { kind: "procedural" },
    tree_pine: { kind: "procedural" },
    bush: { kind: "procedural" },
    lamp: { kind: "procedural" },
    bench: { kind: "procedural" },
    fountain: { kind: "procedural" },
    signpost: { kind: "procedural" },
    open_plot: { kind: "procedural" },
    walker: { kind: "procedural" },
    cloud: { kind: "procedural" },
  },
} satisfies {
  version: number;
  buildings: Record<string, AssetEntry>;
  decorations: Record<string, AssetEntry>;
};

export type BuildingAssetKey = keyof typeof WORLD_ASSETS.buildings;
export type DecorationAssetKey = keyof typeof WORLD_ASSETS.decorations;

/** Every sprite URL the manifest references, for preloading through PIXI.Assets. */
export function spriteSources(): string[] {
  const all = [...Object.values(WORLD_ASSETS.buildings), ...Object.values(WORLD_ASSETS.decorations)] as AssetEntry[];
  return [...new Set(all.flatMap((e) => (e.kind === "sprite" ? [e.src.split("#")[0]!] : [])))];
}
