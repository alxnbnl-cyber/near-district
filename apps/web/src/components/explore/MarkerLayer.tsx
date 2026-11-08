"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { Atlas } from "@yielvy/core/world";
import type { AtlasScene } from "@/world/atlas-scene";
import type { MarkerKind, WorldBuildingData } from "@/world/types";
import { IconClock, IconCube, IconFlag, IconStar } from "./icons";

/**
 * HTML marker layer. The scene publishes its camera; we write it into three CSS variables on
 * this root, and every marker positions itself with calc() — so panning/zooming never causes a
 * React render. React only re-renders when the zoom *bucket* changes (clustering / labels).
 */
export const KIND_COLOR: Record<MarkerKind, string> = {
  hunt: "#32C8EF",
  contest: "#9B87F5",
  upcoming: "#7C8AA0",
  space: "#7C8AA0",
};

const CLUSTER_BELOW = 0.42;
const LABEL_FROM = 0.6;

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

interface Cluster {
  key: string;
  x: number;
  y: number;
  members: WorldBuildingData[];
}

export function MarkerLayer({ atlas, scene, buildings, visibleIds, selectedId, interactive, onSelect, onZoomTo }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

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

  const clusters: Cluster[] = useMemo(() => {
    if (scale >= CLUSTER_BELOW) return shown.map((b) => ({ key: b.spaceId, x: b.x * atlas.width, y: b.y * atlas.height, members: [b] }));
    const radius = 70 / scale; // world units ≈ 70 screen px
    const out: Cluster[] = [];
    for (const b of shown) {
      const x = b.x * atlas.width, y = b.y * atlas.height;
      const near = out.find((c) => Math.hypot(c.x - x, c.y - y) < radius);
      if (near && b.spaceId !== selectedId && !near.members.some((m) => m.spaceId === selectedId)) {
        near.members.push(b);
        near.x = (near.x * (near.members.length - 1) + x) / near.members.length;
        near.y = (near.y * (near.members.length - 1) + y) / near.members.length;
      } else out.push({ key: b.spaceId, x, y, members: [b] });
    }
    return out;
  }, [shown, scale, atlas, selectedId]);

  const pos = (x: number, y: number) => ({
    transform: `translate(calc(${x} * var(--s) * 1px + var(--tx) * 1px), calc(${y} * var(--s) * 1px + var(--ty) * 1px))`,
  });

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" style={{ ["--tx" as string]: 0, ["--ty" as string]: 0, ["--s" as string]: 0.3 }}>
      {/* district & landmark labels */}
      {atlas.districts.map((d) => (
        <div key={d.id} className="absolute left-0 top-0 will-change-transform" style={pos(d.label[0], d.label[1])}>
          <div
            className="-translate-x-1/2 -translate-y-1/2 rounded-md border border-line-strong/80 bg-[#0e131bcc] px-3 py-1.5 text-center backdrop-blur-sm transition-opacity duration-300"
            style={{ opacity: scale > 1.3 ? 0 : 1 }}
          >
            <p className="whitespace-nowrap font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-ink">{d.name}</p>
            <p className="whitespace-nowrap text-[10.5px] font-medium text-ink-3">{d.caption}</p>
          </div>
        </div>
      ))}
      <div className="absolute left-0 top-0" style={pos(atlas.central.center[0], atlas.central.center[1])}>
        <div className="-translate-x-1/2 -translate-y-1/2 rounded-md border border-orange/40 bg-[#0e131bcc] px-3 py-1.5 font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-orange-ink">
          Central Plaza
        </div>
      </div>

      {clusters.map((c) =>
        c.members.length > 1 ? (
          <div key={`c-${c.key}`} className="absolute left-0 top-0" style={pos(c.x, c.y)}>
            <button
              type="button"
              disabled={!interactive}
              onClick={() => onZoomTo(c.x, c.y, CLUSTER_BELOW * 1.6)}
              aria-label={`${c.members.length} Spaces here. Zoom in`}
              className="pointer-events-auto grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-orange/60 bg-[#151a25] font-display text-[14px] font-bold text-ink shadow-[0_0_0_6px_rgb(255_145_56/0.12)] transition-transform hover:scale-110"
            >
              {c.members.length}
            </button>
          </div>
        ) : (
          <Marker
            key={c.key}
            b={c.members[0]!}
            style={pos(c.x, c.y)}
            selected={c.members[0]!.spaceId === selectedId}
            showLabel={scale >= LABEL_FROM}
            interactive={interactive}
            onSelect={onSelect}
          />
        ),
      )}
    </div>
  );
}

const Marker = memo(function Marker({
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
  const accent = KIND_COLOR[b.kind];
  const ring = selected ? "#FF9138" : live ? accent : "#3a465a";
  const size = b.flags.includes("featured") ? 46 : live ? 42 : 36;
  const Badge = b.kind === "hunt" ? IconFlag : b.kind === "contest" ? IconStar : b.kind === "upcoming" ? IconClock : null;
  return (
    <div className="absolute left-0 top-0" style={{ ...style, zIndex: selected ? 30 : live ? 20 : 10 }}>
      <button
        type="button"
        disabled={!interactive}
        onClick={() => onSelect(b.spaceId)}
        aria-label={`${b.name}${live ? `, ${b.liveCampaigns} live experience${b.liveCampaigns > 1 ? "s" : ""}` : ""}`}
        aria-pressed={selected}
        className="group pointer-events-auto relative block -translate-x-1/2 -translate-y-full pb-2 outline-none"
      >
        {live && !selected && (
          <span aria-hidden className="absolute left-1/2 top-[calc(50%-4px)] size-10 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ boxShadow: `0 0 0 2px ${accent}55`, animation: "yv-pulse-ring 2.6s ease-out infinite" }} />
        )}
        <span
          className="relative grid place-items-center overflow-hidden rounded-[12px] bg-[#121722] transition-transform duration-150 group-hover:scale-110 group-focus-visible:scale-110"
          style={{
            width: size,
            height: size,
            border: `2px solid ${ring}`,
            transform: selected ? "scale(1.12)" : undefined,
            boxShadow: selected ? "0 0 0 5px rgb(255 145 56 / 0.18), 0 10px 24px -8px rgb(0 0 0 / .8)" : "0 8px 20px -8px rgb(0 0 0 / .8)",
            color: live ? accent : "#9AA6B5",
          }}
        >
          {b.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logoUrl} alt="" className="size-full object-cover" />
          ) : (
            <IconCube size={size * 0.5} />
          )}
        </span>
        <span aria-hidden className="absolute bottom-0.5 left-1/2 size-3 -translate-x-1/2 rotate-45 bg-[#121722]" style={{ borderRight: `2px solid ${ring}`, borderBottom: `2px solid ${ring}` }} />
        {Badge && (
          <span aria-hidden className="absolute -right-2 -top-1.5 grid size-[22px] place-items-center rounded-full border-2 border-[#090b10]" style={{ background: accent, color: "#090b10" }}>
            <Badge size={12} />
          </span>
        )}
        <span
          className={`pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-[#0e131bee] px-2 py-1 text-[12px] font-semibold text-ink transition-opacity duration-150 ${
            showLabel || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          }`}
        >
          {b.name}
        </span>
      </button>
    </div>
  );
});
