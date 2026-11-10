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
const LABEL_FROM = 0.25;

const KIND_TEXT: Record<MarkerKind, string> = {
  hunt: "Mission · live",
  contest: "Challenge · live",
  upcoming: "Opening soon",
  space: "Project",
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

const HEX = "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)";
const PLATE = "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))";

/** Game-style mission marker: hex badge on a stem, radar ping for live missions, angled info plate. */
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
  const prize = live ? b.topPrize : null;
  const funded = live && (b.featured?.rewards === "token" || Boolean(prize));
  const tone = funded ? "#FFC24B" : live ? "#FF9138" : "#7C8AA0";
  const size = selected ? 50 : live ? 42 : 32;
  const Icon = b.kind === "hunt" ? IconFlag : b.kind === "contest" ? IconStar : b.kind === "upcoming" ? IconClock : IconCube;
  const typeLabel = b.kind === "contest" ? "Challenge" : b.kind === "upcoming" ? "Mission · soon" : "Mission";
  return (
    <div className="absolute left-0 top-0" style={{ ...style, zIndex: selected ? 40 : funded ? 30 : live ? 20 : 10 }}>
      <button
        type="button"
        disabled={!interactive}
        onClick={() => onSelect(b.spaceId)}
        aria-label={`${b.name}${live ? `, ${KIND_TEXT[b.kind]}` : ""}${prize ? `, reward ${prize.amount} ${prize.symbol}` : ""}`}
        aria-pressed={selected}
        className="group pointer-events-auto relative block outline-none"
        style={{ transform: "translate(-50%, -100%)" }}
      >
        {/* ground marker + radar ping */}
        <span aria-hidden className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-1/2">
          <span className="block rounded-[50%] border" style={{ width: size * 0.95, height: size * 0.34, borderColor: `${tone}aa`, background: `${tone}22` }} />
          {live && (
            <span
              className="absolute inset-0 rounded-[50%] border-2"
              style={{ borderColor: tone, animation: "yv-radar 2.2s ease-out infinite" }}
            />
          )}
        </span>
        {/* stem */}
        <span aria-hidden className="absolute left-1/2 top-full block w-[2px] -translate-x-1/2" style={{ height: size * 0.36, marginTop: -size * 0.36, background: `linear-gradient(${tone}, transparent)` }} />
        {/* hex badge */}
        <span
          className="relative block transition-transform duration-150 group-hover:-translate-y-1 group-focus-visible:-translate-y-1"
          style={{ width: size, height: size * 1.12, marginBottom: size * 0.36, filter: `drop-shadow(0 0 ${selected ? 14 : 8}px ${tone}88) drop-shadow(0 6px 10px rgb(0 0 0 / .7))` }}
        >
          <span className="absolute inset-0" style={{ clipPath: HEX, background: tone }} />
          <span className="absolute inset-[2.5px] grid place-items-center" style={{ clipPath: HEX, background: "linear-gradient(180deg,#141922,#07090c)", color: tone }}>
            {b.logoUrl && selected ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logoUrl} alt="" className="size-[62%] rounded-sm object-cover" />
            ) : (
              <Icon size={size * 0.42} />
            )}
          </span>
          {funded && (
            <span className="absolute -right-1.5 -top-1 grid size-4 place-items-center rounded-full bg-reward text-[9px] font-black text-[#2a1600] shadow-[0_0_8px_rgb(255_194_75/.8)]">
              $
            </span>
          )}
        </span>
        {/* info plate */}
        <span
          className={`pointer-events-none absolute top-0 whitespace-nowrap bg-[#05070af2] px-3 py-2 text-left font-mono transition-opacity duration-150 ${
            showLabel || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          }`}
          style={{ left: size + 8, clipPath: PLATE, boxShadow: `inset 0 0 0 1px ${tone}55` }}
        >
          <span className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: tone }}>
            {live && <span className="size-1.5 animate-pulse rounded-full" style={{ background: tone }} />}
            {typeLabel}
            {live ? " · live" : ""}
          </span>
          <span className="mt-0.5 block font-display text-[13.5px] font-bold uppercase tracking-[0.03em] text-ink">{b.featured?.title ?? b.name}</span>
          {b.featured && <span className="block text-[9.5px] uppercase tracking-[0.16em] text-[rgb(214_219_225/.5)]">{b.name}</span>}
          {prize ? (
            <span className="mt-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em]">
              <span className="text-[rgb(214_219_225/.55)]">{prize.kind === "yield" ? "Yield" : "Reward"}</span>
              <span className="text-reward">
                {prize.amount} {prize.symbol}
              </span>
              {prize.apy && <span className="text-mint-ink">{prize.apy} APY</span>}
              {prize.demo && <span className="rounded-sm bg-sky/20 px-1 text-[8.5px] tracking-[0.18em] text-sky-ink">Demo</span>}
            </span>
          ) : funded ? (
            <span className="mt-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-reward">Token reward</span>
          ) : null}
        </span>
      </button>
      <style>{`@keyframes yv-radar { 0% { transform: scale(.6); opacity: .9 } 100% { transform: scale(2.6); opacity: 0 } }`}</style>
    </div>
  );
});
