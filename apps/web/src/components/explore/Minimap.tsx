"use client";

import { useEffect, useRef } from "react";
import type { Atlas } from "@yielvy/core/world";
import type { AtlasScene } from "@/world/atlas-scene";
import type { WorldBuildingData } from "@/world/types";
import { MAP_THEME } from "@/world/theme";

const SIZE = 172;
/** World units shown across the radar. */
const SPAN = 3600;

/**
 * Game-style circular minimap: the area around the camera, live missions as orange blips, the
 * current view as a box, a radar sweep and a north mark. Click to fly there.
 */
export function Minimap({ scene, atlas, buildings }: { scene: AtlasScene | null; atlas: Atlas; buildings: WorldBuildingData[] }) {
  const layer = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const k = SIZE / SPAN;

  useEffect(() => {
    if (!scene) return;
    return scene.onCamera(() => {
      const v = scene.viewport();
      const cx = (v.x + v.w / 2) * atlas.width, cy = (v.y + v.h / 2) * atlas.height;
      if (layer.current) layer.current.style.transform = `translate(${SIZE / 2 - cx * k}px, ${SIZE / 2 - cy * k}px)`;
      if (view.current) {
        const w = Math.min(SIZE * 1.4, v.w * atlas.width * k), h = Math.min(SIZE * 1.4, v.h * atlas.height * k);
        view.current.style.width = `${w}px`;
        view.current.style.height = `${h}px`;
      }
    });
  }, [scene, atlas, k]);

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!scene) return;
    const r = e.currentTarget.getBoundingClientRect();
    const v = scene.viewport();
    const cx = (v.x + v.w / 2) * atlas.width, cy = (v.y + v.h / 2) * atlas.height;
    const dx = (e.clientX - r.left - SIZE / 2) / k, dy = (e.clientY - r.top - SIZE / 2) / k;
    scene.flyTo(cx + dx, cy + dy, scene.camera().s, 700);
  };

  const live = buildings.filter((b) => b.liveCampaigns > 0);
  return (
    <div className="relative" style={{ width: SIZE + 22, height: SIZE + 22 }}>
      {/* outer ring with ticks + N */}
      <svg aria-hidden viewBox="0 0 194 194" className="absolute inset-0 size-full">
        <circle cx="97" cy="97" r="95" fill="#05070ae6" stroke="rgb(214 219 225 / .22)" strokeWidth="1" />
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * Math.PI * 2, r1 = 95, r2 = i % 9 === 0 ? 88 : 91.5;
          const f = (n: number) => Math.round(n * 100) / 100; // identical on server and client
          return <line key={i} x1={f(97 + Math.sin(a) * r1)} y1={f(97 - Math.cos(a) * r1)} x2={f(97 + Math.sin(a) * r2)} y2={f(97 - Math.cos(a) * r2)} stroke="rgb(214 219 225 / .35)" strokeWidth="1" />;
        })}
        <path d="M97 0 L102 9 L92 9 Z" fill="#FF9138" />
      </svg>
      <span className="absolute left-1/2 top-[11px] -translate-x-1/2 font-mono text-[8.5px] font-bold text-orange">N</span>
      <button
        type="button"
        onClick={onClick}
        aria-label="Minimap. Click to move the map there."
        className="absolute left-[11px] top-[11px] overflow-hidden rounded-full"
        style={{ width: SIZE, height: SIZE, boxShadow: "inset 0 0 0 1px rgb(214 219 225 / .25)" }}
      >
        <div ref={layer} className="absolute left-0 top-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={MAP_THEME.artwork ? MAP_THEME.artwork.replace("@2x", "") : ""}
            alt=""
            draggable={false}
            className="pointer-events-none absolute left-0 top-0 max-w-none"
            style={{ width: atlas.width * k, height: atlas.height * k, filter: "grayscale(1) brightness(1.15) contrast(1.1)", opacity: 0.85 }}
          />
          {live.map((b) => (
            <span
              key={b.spaceId}
              className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-orange shadow-[0_0_6px_rgb(255_145_56/.9)]"
              style={{ left: b.x * atlas.width * k, top: b.y * atlas.height * k }}
            />
          ))}
        </div>
        {/* radar sweep */}
        <span aria-hidden className="yv-sweep absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 0deg, rgb(255 145 56 / .22), transparent 70deg, transparent)" }} />
        {/* centre view box + crosshair */}
        <div ref={view} aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-white/70" />
        <span aria-hidden className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        <span aria-hidden className="absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 0 22px 6px rgb(5 7 10 / .9)" }} />
      </button>
      <style>{`@keyframes yv-sweep { to { transform: rotate(360deg) } } .yv-sweep { animation: yv-sweep 4s linear infinite } @media (prefers-reduced-motion: reduce) { .yv-sweep { animation: none } }`}</style>
    </div>
  );
}
