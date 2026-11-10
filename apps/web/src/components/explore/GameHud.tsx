"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { AtlasScene } from "@/world/atlas-scene";
import type { ViewerStats } from "@/world/types";
import { IconMinus, IconPlus, IconTrophy } from "./icons";

/** Angled "military" plate used across the game HUD. */
export const plate = (cut = 10) => ({ clipPath: `polygon(0 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% 100%, ${cut}px 100%, 0 calc(100% - ${cut}px))` });
const INK = "rgb(214 219 225";

/**
 * Game-style status bar over the map: the player's real rewards and missions, plus live missions.
 * Signed-out players see a prompt instead of numbers.
 */
export function StatusBar({ viewer, live }: { viewer: ViewerStats | null; live: number; demo?: boolean }) {
  const chip = "flex items-center gap-2.5 bg-[#05070ae0] px-3.5 py-2 backdrop-blur-sm";
  const label = "font-mono text-[9.5px] font-bold uppercase tracking-[0.22em]";
  return (
    <div className="yv-enter pointer-events-auto flex flex-wrap items-stretch gap-2">
      <div className={chip} style={{ ...plate(9), boxShadow: "inset 0 0 0 1px rgb(255 194 75 / .35)" }}>
        <IconTrophy size={18} className="text-gold" />
        <div>
          <p className={label} style={{ color: `${INK} / .5)` }}>Rewards earned</p>
          <p className="font-display text-[16px] font-bold leading-tight text-reward">{viewer ? `${viewer.rewardsClaimed} ${viewer.symbol}` : "—"}</p>
        </div>
      </div>
      <div className={chip} style={{ ...plate(9), boxShadow: `inset 0 0 0 1px ${INK} / .18)` }}>
        <svg width="18" height="18" viewBox="0 0 24 24" className="text-orange" aria-hidden>
          <path d="M12 2 21 7v10l-9 5-9-5V7z" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeWidth="1.8" />
          <path d="m8 12 3 3 5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <p className={label} style={{ color: `${INK} / .5)` }}>Missions done</p>
          <p className="font-display text-[16px] font-bold leading-tight text-ink">{viewer ? `${viewer.missionsCompleted} / ${viewer.missionsStarted}` : "—"}</p>
        </div>
      </div>
      <div className={chip} style={{ ...plate(9), boxShadow: `inset 0 0 0 1px ${INK} / .18)` }}>
        <span className="relative grid size-[18px] place-items-center">
          <span className="absolute size-2.5 animate-ping rounded-full bg-orange/60" />
          <span className="size-2 rounded-full bg-orange" />
        </span>
        <div>
          <p className={label} style={{ color: `${INK} / .5)` }}>Live now</p>
          <p className="font-display text-[16px] font-bold leading-tight text-ink">{live} mission{live === 1 ? "" : "s"}</p>
        </div>
      </div>
      {!viewer && (
        <Link href="/signin?next=/explore" className={`${chip} font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-orange hover:text-orange-ink`} style={{ ...plate(9), boxShadow: "inset 0 0 0 1px rgb(255 145 56 / .45)" }}>
          Sign in to track ›
        </Link>
      )}
    </div>
  );
}

/** Vertical game-style zoom slider: + / track / − . */
export function ZoomSlider({ scene }: { scene: AtlasScene | null }) {
  const thumb = useRef<HTMLSpanElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scene) return;
    return scene.onCamera((c) => {
      const { min, max } = scene.zoomRange();
      const t = max > min ? Math.min(1, Math.max(0, Math.log(c.s / min) / Math.log(max / min))) : 1;
      if (thumb.current) thumb.current.style.bottom = `calc(${t * 100}% - 7px)`;
    });
  }, [scene]);

  const setFromPointer = (clientY: number) => {
    if (!scene || !track.current) return;
    const r = track.current.getBoundingClientRect();
    const t = 1 - Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    const { min, max } = scene.zoomRange();
    scene.zoomToScale(min * Math.pow(max / min, t));
  };

  const btn = "grid size-9 place-items-center text-[rgb(214_219_225/.8)] transition-colors hover:text-white";
  return (
    <div className="flex flex-col items-center bg-[#05070ae0] py-1 backdrop-blur-sm" style={{ ...plate(8), boxShadow: `inset 0 0 0 1px ${INK} / .18)` }}>
      <button type="button" className={btn} aria-label="Zoom in" onClick={() => scene?.zoomBy(1.35)}>
        <IconPlus size={16} />
      </button>
      <div
        ref={track}
        role="slider"
        aria-label="Zoom"
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        className="relative my-1 h-28 w-9 cursor-pointer"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setFromPointer(e.clientY);
        }}
        onPointerMove={(e) => e.buttons && setFromPointer(e.clientY)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") scene?.zoomBy(1.15);
          if (e.key === "ArrowDown") scene?.zoomBy(1 / 1.15);
        }}
      >
        <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-[rgb(214_219_225/.18)]" />
        {[0, 25, 50, 75, 100].map((p) => (
          <span key={p} className="absolute left-1/2 h-px w-2.5 -translate-x-1/2 bg-[rgb(214_219_225/.3)]" style={{ bottom: `${p}%` }} />
        ))}
        <span ref={thumb} className="absolute left-1/2 size-3.5 -translate-x-1/2 rotate-45 border-2 border-orange bg-[#05070a] shadow-[0_0_10px_rgb(255_145_56/.6)]" style={{ bottom: "50%" }} />
      </div>
      <button type="button" className={btn} aria-label="Zoom out" onClick={() => scene?.zoomBy(1 / 1.35)}>
        <IconMinus size={16} />
      </button>
    </div>
  );
}
