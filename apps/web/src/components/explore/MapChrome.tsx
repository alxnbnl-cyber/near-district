"use client";

import { useState } from "react";
import type { AtlasScene } from "@/world/atlas-scene";
import { IconClock, IconCube, IconFlag, IconInfo, IconMinus, IconPlus, IconStar } from "./icons";
import { KIND_COLOR } from "./MarkerLayer";

const hud = "rounded-[12px] border border-line bg-[#0b0f15e6] shadow-pop backdrop-blur";

export function ZoomControls({ scene }: { scene: AtlasScene | null }) {
  const btn = "grid size-10 place-items-center text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink";
  return (
    <div className={`flex flex-col overflow-hidden ${hud}`}>
      <button type="button" className={btn} aria-label="Zoom in" title="Zoom in" onClick={() => scene?.zoomBy(1.35)}>
        <IconPlus />
      </button>
      <button type="button" className={`${btn} border-t border-line`} aria-label="Zoom out" title="Zoom out" onClick={() => scene?.zoomBy(1 / 1.35)}>
        <IconMinus />
      </button>
    </div>
  );
}

/** Map key — collapsed by default so the map stays clean. */
export function Legend({ hasRoutes }: { hasRoutes: boolean }) {
  const [open, setOpen] = useState(false);
  const rows: [React.ReactNode, string, string][] = [
    [<IconCube key="c" size={14} />, "#FF9138", "Space (a project's home)"],
    [<IconFlag key="f" size={14} />, KIND_COLOR.hunt, "Treasure Hunt — live"],
    [<IconStar key="s" size={14} />, KIND_COLOR.contest, "Creative Contest — live"],
    [<IconClock key="u" size={14} />, KIND_COLOR.upcoming, "Starting soon"],
  ];
  return (
    <div className={hud}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-9 items-center gap-2 px-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-2 hover:text-ink"
      >
        <IconInfo size={15} /> Map key <span aria-hidden className="text-ink-3">{open ? "–" : "+"}</span>
      </button>
      {open && (
        <ul className="yv-enter space-y-1.5 border-t border-line px-3 py-3">
          {rows.map(([icon, color, label]) => (
            <li key={label} className="flex items-center gap-2.5 text-[12.5px] text-ink-2">
              <span className="grid size-6 place-items-center rounded-md border" style={{ borderColor: `${color}88`, color }}>
                {icon}
              </span>
              {label}
            </li>
          ))}
          <li className="flex items-center gap-2.5 text-[12.5px] text-ink-2">
            <span className="grid size-6 place-items-center rounded-full border border-orange/60 text-[11px] font-bold text-ink">3</span>
            Several Spaces close together
          </li>
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
