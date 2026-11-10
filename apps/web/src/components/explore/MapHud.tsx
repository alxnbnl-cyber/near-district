"use client";

import { useEffect, useRef } from "react";
import type { AtlasScene } from "@/world/atlas-scene";

/** World units between grid lines / crosshair marks (the grid moves and scales with the map). */
const GRID = 750;
/** One grid tile: very faint lines through the centre, with a small, subtle "+" where they cross. */
const TILE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E" +
  "%3Cpath d='M50 0V100M0 50H100' stroke='%23d6dbe1' stroke-opacity='.035' stroke-width='.45'/%3E" +
  "%3Cpath d='M50 46v8M46 50h8' stroke='%23e6e9ed' stroke-opacity='.15' stroke-width='.5'/%3E" +
  "%3C/svg%3E\")";

/** Major grid: every 4th line, a touch stronger grey. Lines sit on the tile edges so they meet the crosshairs. */
const MAJOR_EVERY = 4;
const MAJOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E" +
  "%3Cpath d='M0 0V100M0 0H100' stroke='%23c4cad3' stroke-opacity='.13' stroke-width='.4'/%3E%3C/svg%3E\")";

/**
 * Lighter "survey zones" laid over parts of the map, like patched scan tiles. World units
 * (map is 9000 × 6000), so they stay glued to the same places as you pan and zoom.
 */
const ZONES: [number, number, number, number][] = [
  [5750, 900, 2600, 1450],
  [500, 3700, 2300, 1500],
  [3300, 2500, 1700, 1050],
  [6900, 3900, 1600, 1300],
  [2200, 600, 1300, 900],
];

/**
 * Grey tactical HUD over the map: crosshair grid and faint grid lines locked to the world, lighter
 * survey zones, scanlines, a framed border with corner brackets and a live coordinate readout. Purely visual: never intercepts input; the colourful pins render above it.
 */
export function MapHud({ scene, right, visible, compact = false }: { scene: AtlasScene | null; right: number; visible: boolean; compact?: boolean }) {
  const grid = useRef<HTMLDivElement>(null);
  const zones = useRef<HTMLDivElement>(null);
  const major = useRef<HTMLDivElement>(null);
  const coords = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!scene) return;
    return scene.onCamera((c) => {
      const g = grid.current;
      if (g) {
        const size = GRID * c.s;
        g.style.backgroundSize = `${size}px ${size}px`;
        g.style.backgroundPosition = `${c.tx - size / 2}px ${c.ty - size / 2}px`;
      }
      const m = major.current;
      if (m) {
        const size = GRID * MAJOR_EVERY * c.s;
        m.style.backgroundSize = `${size}px ${size}px`;
        // tile edges land on world multiples of GRID × MAJOR_EVERY, i.e. exactly through every 4th crosshair
        m.style.backgroundPosition = `${c.tx}px ${c.ty}px`;
      }
      if (zones.current) zones.current.style.transform = `translate(${c.tx}px, ${c.ty}px) scale(${c.s})`;
      if (coords.current) {
        const v = scene.viewport();
        const cx = Math.round((v.x + v.w / 2) * 9000), cy = Math.round((v.y + v.h / 2) * 6000);
        coords.current.textContent = `X ${String(cx).padStart(4, "0")}  ·  Y ${String(cy).padStart(4, "0")}  ·  ZOOM ${(c.s * 100).toFixed(0)}`;
      }
    });
  }, [scene]);

  const ink = "rgb(214 219 225";
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-y-0 left-0 overflow-hidden transition-opacity duration-700 ${visible ? "opacity-100" : "opacity-0"}`} style={{ right }}>
      {/* lighter survey zones, locked to the world */}
      <div ref={zones} className="absolute left-0 top-0 origin-top-left">
        {ZONES.map(([x, y, w, h], i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: x, top: y, width: w, height: h, background: "rgb(200 206 214 / .035)", boxShadow: "inset 0 0 0 4px rgb(200 206 214 / .055)" }}
          />
        ))}
      </div>
      {/* faint grid lines + subtle crosshairs, locked to the world */}
      <div ref={grid} className="absolute inset-0" style={{ backgroundImage: TILE, backgroundRepeat: "repeat" }} />
      {/* slightly stronger grey major grid every few tiles, like a survey overlay */}
      <div ref={major} className="absolute inset-0" style={{ backgroundImage: MAJOR, backgroundRepeat: "repeat" }} />
      {/* scanlines */}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, rgb(0 0 0 / .2) 0px, rgb(0 0 0 / .2) 1px, transparent 1px, transparent 3px)", mixBlendMode: "multiply" }}
      />
      {/* framed border with corner brackets */}
      <div className="absolute inset-3 rounded-[3px] border" style={{ borderColor: `${ink} / .16)` }}>
        {[
          "left-[-1px] top-[-1px] border-l-2 border-t-2",
          "right-[-1px] top-[-1px] border-r-2 border-t-2",
          "left-[-1px] bottom-[-1px] border-l-2 border-b-2",
          "right-[-1px] bottom-[-1px] border-r-2 border-b-2",
        ].map((c) => (
          <span key={c} className={`absolute size-5 ${c}`} style={{ borderColor: `${ink} / .6)` }} />
        ))}
      </div>
      {/* live coordinates */}
      <span ref={coords} className={`absolute bottom-6 left-7 transition-opacity duration-500 ${compact ? "opacity-0" : "opacity-100"} font-mono text-[10.5px] tracking-[0.2em]`} style={{ color: `${ink} / .5)` }} />
    </div>
  );
}
