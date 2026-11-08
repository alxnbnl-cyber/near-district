"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Atlas } from "@yielvy/core/world";
import type { AtlasScene } from "@/world/atlas-scene";
import type { WorldBuildingData } from "@/world/types";
import { IconClock, IconCube, IconFlag, IconLocate, IconMinus, IconPlus, IconStar } from "./icons";
import { KIND_COLOR } from "./MarkerLayer";

/** Overview map with a live viewport frame. Click to jump. */
export function Minimap({ atlas, scene, buildings }: { atlas: Atlas; scene: AtlasScene | null; buildings: WorldBuildingData[] }) {
  const frame = useRef<SVGRectElement>(null);
  const W = 176, H = (176 * atlas.height) / atlas.width;
  const k = W / atlas.width;
  const sea = useMemo(() => [...atlas.coast.map(([x, y]) => `${x * k},${y * k}`), `${W + 4},${H + 4}`, `${W + 4},-4`].join(" "), [atlas, k, W, H]);
  const river = useMemo(() => atlas.river.map(([x, y], i) => `${i ? "L" : "M"}${(x * k).toFixed(1)},${(y * k).toFixed(1)}`).join(""), [atlas, k]);
  useEffect(() => {
    if (!scene) return;
    return scene.onCamera(() => {
      const v = scene.viewport();
      const f = frame.current;
      if (!f) return;
      f.setAttribute("x", String(Math.max(0, v.x * W)));
      f.setAttribute("y", String(Math.max(0, v.y * H)));
      f.setAttribute("width", String(Math.min(W, v.w * W)));
      f.setAttribute("height", String(Math.min(H, v.h * H)));
    });
  }, [scene, W, H]);
  return (
    <div className="hidden rounded-[12px] border border-line bg-[#0e131bdd] p-2 shadow-pop backdrop-blur md:block">
      <svg
        width={W}
        height={H}
        role="img"
        aria-label="Overview map. Click to move there."
        className="block cursor-pointer rounded-md"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          scene?.flyTo(((e.clientX - r.left) / W) * atlas.width, ((e.clientY - r.top) / H) * atlas.height);
        }}
      >
        <rect width={W} height={H} fill="#121823" />
        <polygon points={sea} fill="#0a1a28" />
        <path d={river} stroke="#0f2a40" strokeWidth={atlas.riverWidth * k + 1} fill="none" strokeLinecap="round" />
        {buildings.map((b) => (
          <circle key={b.spaceId} cx={b.x * W} cy={b.y * H} r={b.liveCampaigns ? 2.4 : 1.6} fill={b.liveCampaigns ? KIND_COLOR[b.kind] : "#5b6779"} />
        ))}
        <circle cx={atlas.central.center[0] * k} cy={atlas.central.center[1] * k} r={2.6} fill="#FF9138" />
        <rect ref={frame} fill="rgb(255 145 56 / 0.08)" stroke="#FF9138" strokeWidth={1.2} rx={2} />
      </svg>
    </div>
  );
}

export function ZoomControls({ scene }: { scene: AtlasScene | null }) {
  const btn = "grid size-10 place-items-center text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink";
  return (
    <div className="flex flex-col overflow-hidden rounded-[12px] border border-line bg-[#0e131bdd] shadow-pop backdrop-blur">
      <button type="button" className={btn} aria-label="Zoom in" title="Zoom in" onClick={() => scene?.zoomBy(1.35)}>
        <IconPlus />
      </button>
      <button type="button" className={`${btn} border-y border-line`} aria-label="Zoom out" title="Zoom out" onClick={() => scene?.zoomBy(1 / 1.35)}>
        <IconMinus />
      </button>
      <button type="button" className={btn} aria-label="Back to Central Plaza" title="Back to Central Plaza" onClick={() => scene?.home()}>
        <IconLocate size={16} />
      </button>
    </div>
  );
}

export function Legend({ hasRoutes }: { hasRoutes: boolean }) {
  const [open, setOpen] = useState(true);
  const rows: [React.ReactNode, string, string][] = [
    [<IconCube key="c" size={14} />, "#FF9138", "Space (project)"],
    [<IconFlag key="f" size={14} />, KIND_COLOR.hunt, "Treasure Hunt"],
    [<IconStar key="s" size={14} />, KIND_COLOR.contest, "Creative Contest"],
    [<IconClock key="u" size={14} />, KIND_COLOR.upcoming, "Starting soon"],
  ];
  return (
    <div className="hidden rounded-[12px] border border-line bg-[#0e131bdd] shadow-pop backdrop-blur md:block">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-6 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3 hover:text-ink">
        Legend <span aria-hidden>{open ? "–" : "+"}</span>
      </button>
      {open && (
        <ul className="space-y-1.5 px-3 pb-3">
          {rows.map(([icon, color, label]) => (
            <li key={label} className="flex items-center gap-2.5 text-[12.5px] text-ink-2">
              <span className="grid size-6 place-items-center rounded-md border" style={{ borderColor: `${color}88`, color }}>
                {icon}
              </span>
              {label}
            </li>
          ))}
          {hasRoutes && (
            <li className="flex items-center gap-2.5 text-[12.5px] text-ink-2">
              <span className="w-6 border-t-2 border-dashed border-sky" /> Adventure route
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
