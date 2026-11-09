"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { Atlas } from "@yielvy/core/world";
import type { AtlasScene } from "@/world/atlas-scene";
import type { MarkerKind, WorldBuildingData } from "@/world/types";
import { IconClock, IconCube, IconFlag, IconStar } from "./icons";

/**
 * HTML marker layer. The scene publishes its camera into three CSS variables on this root;
 * markers position themselves with calc(), so pan/zoom never re-renders React.
 */
export const KIND_COLOR: Record<MarkerKind, string> = {
  hunt: "#32C8EF",
  contest: "#9B87F5",
  upcoming: "#7C8AA0",
  space: "#7C8AA0",
};

const CLUSTER_BELOW = 0.14;
const LABEL_FROM = 0.3;

const KIND_TEXT: Record<MarkerKind, string> = {
  hunt: "Treasure Hunt · live",
  contest: "Creative Contest · live",
  upcoming: "Starting soon",
  space: "Space",
};

interface Props {
  atlas: Atlas;
  scene: AtlasScene | null;
  buildings: WorldBuildingData[];
  visibleIds: Set<string> | null;
  selectedId: string | null;
  interactive: boolean;
  onSelect(id: string): void;
  onZoomTo(x: number, y: number, s: number): void;
}

export function MarkerLayer({ atlas, scene, buildings, visibleIds, selectedId, interactive, onSelect, onZoomTo }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);

  useEffect(() => {
    if (!scene) return;
    let bucket = NaN;
    return scene.onCamera((c) => {
      const el = root.current;
      if (el) {
        el.style.setProperty("--tx", String(c.tx));
        el.style.setProperty("--ty", String(c.ty));
        el.style.setProperty("--s", String(c.s));
      }
      const b = Math.round(Math.log2(c.s) * 4);
      if (b !== bucket) {
        bucket = b;
        setScale(c.s);
      }
    });
  }, [scene]);

  const shown = useMemo(() => buildings.filter((b) => !visibleIds || visibleIds.has(b.spaceId)), [buildings, visibleIds]);

  const groups = useMemo(() => {
    const pts = shown.map((b) => ({ b, x: b.x * atlas.width, y: b.y * atlas.height }));
    if (scale >= CLUSTER_BELOW) return pts.map((p) => ({ key: p.b.spaceId, x: p.x, y: p.y, members: [p.b] }));
    const radius = 46 / scale;
    const out: { key: string; x: number; y: number; members: WorldBuildingData[] }[] = [];
    for (const p of pts) {
      const near = out.find((c) => Math.hypot(c.x - p.x, c.y - p.y) < radius);
      if (near && p.b.spaceId !== selectedId) {
        near.members.push(p.b);
        near.x = (near.x * (near.members.length - 1) + p.x) / near.members.length;
        near.y = (near.y * (near.members.length - 1) + p.y) / near.members.length;
      } else out.push({ key: p.b.spaceId, x: p.x, y: p.y, members: [p.b] });
    }
    return out;
  }, [shown, scale, atlas, selectedId]);

  const pos = (x: number, y: number) => ({
    transform: `translate(calc(${x} * var(--s) * 1px + var(--tx) * 1px), calc(${y} * var(--s) * 1px + var(--ty) * 1px))`,
  });

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" style={{ ["--tx" as string]: 0, ["--ty" as string]: 0, ["--s" as string]: 0.6 }}>
      {groups.map((g) =>
        g.members.length > 1 ? (
          <div key={`c-${g.key}`} className="absolute left-0 top-0" style={pos(g.x, g.y)}>
            <button
              type="button"
              disabled={!interactive}
              onClick={() => onZoomTo(g.x, g.y, CLUSTER_BELOW * 2.2)}
              aria-label={`${g.members.length} Spaces here. Zoom in`}
              className="pointer-events-auto grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-orange bg-[#0b0f15] font-display text-[13px] font-bold text-ink shadow-[0_6px_18px_-6px_rgb(0_0_0/.9)] transition-transform hover:scale-110"
            >
              {g.members.length}
            </button>
          </div>
        ) : (
          <Pin key={g.key} b={g.members[0]!} style={pos(g.x, g.y)} selected={g.members[0]!.spaceId === selectedId} showLabel={scale >= LABEL_FROM} interactive={interactive} onSelect={onSelect} />
        ),
      )}
    </div>
  );
}

const Pin = memo(function Pin({
  b,
  style,
  selected,
  showLabel,
  interactive,
  onSelect,
}: {
  b: WorldBuildingData;
  style: React.CSSProperties;
  selected: boolean;
  showLabel: boolean;
  interactive: boolean;
  onSelect(id: string): void;
}) {
  const live = b.liveCampaigns > 0;
  const fill = live || selected ? "#FF9138" : "#5d6879";
  const size = selected ? 58 : live ? 46 : 38;
  const Icon = b.kind === "hunt" ? IconFlag : b.kind === "contest" ? IconStar : b.kind === "upcoming" ? IconClock : IconCube;
  return (
    <div className="absolute left-0 top-0" style={{ ...style, zIndex: selected ? 40 : live ? 20 : 10 }}>
      <button
        type="button"
        disabled={!interactive}
        onClick={() => onSelect(b.spaceId)}
        aria-label={`${b.name}${live ? `, ${KIND_TEXT[b.kind]}` : ""}`}
        aria-pressed={selected}
        className="group pointer-events-auto relative block outline-none"
        style={{ transform: `translate(-50%, -100%)` }}
      >
        {/* ground ring */}
        <span
          aria-hidden
          className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2"
          style={{ width: size * 0.9, height: size * 0.32, borderColor: selected ? "rgb(255 145 56 / .8)" : "rgb(255 255 255 / .35)", background: selected ? "rgb(255 145 56 / .18)" : "rgb(0 0 0 / .35)" }}
        />
        {/* teardrop pin */}
        <svg width={size} height={size * 1.25} viewBox="0 0 40 50" className="relative block drop-shadow-[0_8px_14px_rgb(0_0_0/.75)] transition-transform duration-150 group-hover:-translate-y-1 group-focus-visible:-translate-y-1">
          <path d="M20 49C20 49 3 30.5 3 18.5a17 17 0 0 1 34 0C37 30.5 20 49 20 49Z" fill={fill} stroke="#0b0f15" strokeWidth="2" />
          <circle cx="20" cy="18.5" r="11.5" fill="#0b0f15" />
        </svg>
        <span className="absolute left-1/2 grid -translate-x-1/2 place-items-center overflow-hidden rounded-full" style={{ top: size * 0.155, width: size * 0.56, height: size * 0.56, color: fill }}>
          {b.logoUrl && selected ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logoUrl} alt="" className="size-full object-cover" />
          ) : (
            <Icon size={size * 0.34} />
          )}
        </span>
        {/* name label */}
        <span
          className={`pointer-events-none absolute top-[18%] whitespace-nowrap rounded-[10px] border border-white/10 bg-[#0b0f15f0] px-3 py-1.5 text-left shadow-[0_8px_20px_-8px_rgb(0_0_0/.9)] transition-opacity duration-150 ${
            showLabel || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          }`}
          style={{ left: size * 0.86 }}
        >
          <span className="block text-[13px] font-semibold leading-tight text-ink">{b.name}</span>
          <span className="block text-[11px] leading-tight" style={{ color: live ? KIND_COLOR[b.kind] : "#7C8AA0" }}>
            {KIND_TEXT[b.kind]}
          </span>
        </span>
      </button>
    </div>
  );
});
