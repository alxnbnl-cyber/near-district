"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { AtlasScene } from "@/world/atlas-scene";
import type { ViewerStats } from "@/world/types";
import { IconMinus, IconPlus, IconTrophy } from "./icons";

export { cutEdges, frame, plate } from "./frame";
import { cutEdges, frame, plate } from "./frame";

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
      <div className={chip} style={frame(9, "rgb(255 194 75 / .35)")}>
        <IconTrophy size={18} className="text-gold" />
        <div>
          <p className={label} style={{ color: `${INK} / .5)` }}>Rewards earned</p>
          <p className="font-display text-[16px] font-bold leading-tight text-reward">{viewer ? `${viewer.rewardsClaimed} ${viewer.symbol}` : "—"}</p>
        </div>
      </div>
      <div className={chip} style={frame(9, `${INK} / .18)`)}>
        <svg width="18" height="18" viewBox="0 0 24 24" className="text-orange" aria-hidden>
          <path d="M12 2 21 7v10l-9 5-9-5V7z" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeWidth="1.8" />
          <path d="m8 12 3 3 5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <p className={label} style={{ color: `${INK} / .5)` }}>Missions done</p>
          <p className="font-display text-[16px] font-bold leading-tight text-ink">{viewer ? `${viewer.missionsCompleted} / ${viewer.missionsStarted}` : "—"}</p>
        </div>
      </div>
      <div className={chip} style={frame(9, `${INK} / .18)`)}>
        <span className="relative grid size-[18px] place-items-center">
          <span className="absolute size-2.5 animate-ping rounded-full bg-[#34d399]/60" />
          <span className="size-2 rounded-full bg-[#34d399]" />
        </span>
        <div>
          <p className={label} style={{ color: `${INK} / .5)` }}>Live on map</p>
          <p className="font-display text-[16px] font-bold leading-tight text-ink">{live} mission{live === 1 ? "" : "s"}</p>
        </div>
      </div>
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
    <div className="flex flex-col items-center bg-[#05070ae0] py-1 backdrop-blur-sm" style={frame(8, `${INK} / .18)`)}>
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

/** Tab stuck to the right edge, like a game's slide-out drawer handle. */
export function SearchTab({ open, onToggle }: { open: boolean; onToggle(): void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? "Close search" : "Open search"}
      className="group flex w-[58px] flex-col items-center gap-1 bg-[#05070ae8] py-3 pl-1 backdrop-blur-sm transition-colors hover:bg-[#0b0f15]"
      style={{ clipPath: "polygon(14px 0, 100% 0, 100% 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)", boxShadow: "inset 0 0 0 1px rgb(255 145 56 / .45)", ...cutEdges(14, "rgb(255 145 56 / .45)", 1, ["tl", "bl"]) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/ui/icon-explore.webp" alt="" className="size-9 transition-transform group-hover:scale-110" />
      <span className="font-mono text-[9px] font-bold tracking-[0.24em] text-orange">{open ? "CLOSE" : "SEARCH"}</span>
      <span aria-hidden className={`font-mono text-[10px] text-[rgb(214_219_225/.5)] transition-transform ${open ? "rotate-180" : ""}`}>‹</span>
    </button>
  );
}

export type DockId = "explore" | "progress" | "guide";

/**
 * Square action buttons at the bottom centre. Explore is the hero (players' main action, glowing
 * orange); "Host mission" is for organisations, so it sits apart, quieter, with a dashed outline.
 */
export function Dock({ active, onPick }: { active: DockId | null; onPick(id: DockId): void }) {
  const items: { id: DockId; label: string; icon: string }[] = [
    { id: "explore", label: "Explore", icon: "/assets/ui/icon-explore.webp" },
    { id: "progress", label: "Progress", icon: "/assets/ui/icon-earn.webp" },
    { id: "guide", label: "Guide", icon: "/assets/ui/icon-play.webp" },
  ];
  const sq = "group relative flex size-[78px] flex-col items-center justify-center gap-1 text-center backdrop-blur-sm transition-transform hover:-translate-y-1";
  const label = "font-mono text-[9.5px] font-bold uppercase leading-tight tracking-[0.14em]";
  return (
    <nav aria-label="Game menu" className="yv-enter pointer-events-auto flex items-center gap-2">
      {items.map((it) => {
        const hero = it.id === "explore";
        const on = active === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onPick(it.id)}
            aria-pressed={on}
            className={`${sq} ${hero ? "yv-hero" : on ? "bg-[#1a1209f0]" : "bg-[#05070ae8]"}`}
            style={
              hero
                ? frame(10, "rgb(255 145 56 / .6)", 1, { shadow: "0 0 12px rgb(255 145 56 / .18)", bg: "linear-gradient(160deg,rgb(255 145 56 / .16),rgb(5 7 10 / .92) 70%)" })
                : frame(10, on ? "rgb(255 145 56 / .8)" : `${INK} / .2)`)
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.icon} alt="" className={`size-10 group-hover:scale-110 ${on ? "[filter:none] transition-transform" : "[filter:saturate(.4)_brightness(.8)_contrast(1.05)] transition-[filter,transform] duration-300 group-hover:[filter:none]"}`} />
            <span className={`${label} ${hero || on ? "text-orange" : "text-[rgb(214_219_225/.75)]"}`}>{it.label}</span>
          </button>
        );
      })}
      <span aria-hidden className="mx-1.5 h-10 w-px bg-[rgb(214_219_225/.14)]" />
      <Link href="/host?from=map" title="For organisations: host a mission on the map" className={`${sq} bg-[#05070ae8]`} style={plate(10)}>
        {/* dotted outline marks it as the organisation action */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 78 78" preserveAspectRatio="none">
          <path d="M0.75 0.75 H67.5 L77.25 10.5 V77.25 H10.5 L0.75 67.5 Z" fill="none" stroke="rgb(214 219 225 / .5)" strokeWidth="1.2" strokeDasharray="2 3" className="transition-[stroke] group-hover:stroke-[rgb(255_145_56/.8)]" />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/ui/icon-host.webp" alt="" className="size-10 group-hover:scale-110 [filter:saturate(.4)_brightness(.8)_contrast(1.05)] transition-[filter,transform] duration-300 group-hover:[filter:none]" />
        <span className={`${label} text-[rgb(214_219_225/.75)] group-hover:text-white`}>Host mission</span>
      </Link>
      <style>{`@keyframes yv-hero-glow { 50% { box-shadow: inset 0 0 0 1px rgb(255 160 90 / .8), 0 0 18px rgb(255 145 56 / .3) } } .yv-hero { animation: yv-hero-glow 3.6s ease-in-out infinite } @media (prefers-reduced-motion: reduce) { .yv-hero { animation: none } }`}</style>
    </nav>
  );
}

/** The player's badge, top right (opens the account menu when signed in). */
export function ProfileBadge({ name }: { name: string | null }) {
  return (
    <span
      className="group flex cursor-pointer items-center gap-2.5 bg-[#05070ad0] py-1 pl-3.5 pr-1.5 backdrop-blur-sm transition-colors hover:bg-[#0d1117e6]"
      style={frame(10, `${INK} / .18)`)}
    >
      <span className="hidden text-right font-mono sm:block">
        <span className="block text-[9px] font-bold uppercase tracking-[0.24em] text-[rgb(214_219_225/.45)]">{name ? "Player" : "Guest"}</span>
        <span className="block max-w-36 truncate text-[12px] font-bold uppercase tracking-[0.08em] text-white group-hover:text-orange">{name ?? "Sign in"}</span>
      </span>
      <span className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/ui/icon-profile.webp" alt="" className="size-12 group-hover:scale-105 [filter:saturate(.4)_brightness(.8)_contrast(1.05)] transition-[filter,transform] duration-300 group-hover:[filter:none]" />
        {/* dropdown cue */}
        <span aria-hidden className="absolute -bottom-0.5 -right-0.5 grid size-[18px] place-items-center rounded-full border border-orange bg-[#05070a] text-orange shadow-[0_0_8px_rgb(255_145_56/.6)] transition-transform group-hover:translate-y-0.5">
          <svg width="9" height="9" viewBox="0 0 10 10">
            <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
    </span>
  );
}
