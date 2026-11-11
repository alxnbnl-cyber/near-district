"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { frame, plate } from "./GameHud";
import { ARTWORK_LOTS, type Atlas } from "@yielvy/core/world";
import type { AtlasScene } from "@/world/atlas-scene";
import type { WorldBuildingData } from "@/world/types";
import { IconChevron } from "./icons";
import { formatRate, LiveReward, rewardRate } from "./LiveReward";
import { Tutorial } from "./Tutorial";

/**
 * Opening scene: the camera tours random spots on the real map. At each stop a reticle locks on,
 * a leader line draws itself and an info plate opens. Mission stops show real mission data;
 * scan stops show only the grid position — nothing is invented.
 */
const WORDS = ["secret missions", "hidden rewards", "real prizes"];
const DRIFT_MS = 9000;
const HOLD_MS = 3800;
const GAP_MS = 500;


type Stop =
  | { kind: "mission"; b: WorldBuildingData; x: number; y: number }
  | { kind: "scan"; x: number; y: number };

export function WelcomeOverlay({
  atlas,
  scene,
  buildings,
  leaving,
  onEnter,
}: {
  atlas: Atlas;
  buildings: WorldBuildingData[];
  scene: AtlasScene | null;
  leaving: boolean;
  onEnter(): void;
  stats?: unknown;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [word, setWord] = useState(0);
  const [how, setHow] = useState(false);
  const [stop, setStop] = useState<{ s: Stop; n: number; flip: boolean } | null>(null);

  const missions = useMemo(
    () => {
      // only missions with a reward to show (the orange lock-on); any live mission if none has one yet
      const live = buildings.filter((b) => b.liveCampaigns > 0 && b.featured);
      const rewarded = live.filter((b) => b.topPrize || b.featured!.prize);
      return (rewarded.length ? rewarded : live).map((b) => ({ kind: "mission" as const, b, x: b.x * atlas.width, y: b.y * atlas.height }));
    },
    [buildings, atlas],
  );

  useEffect(() => {
    const t = setInterval(() => setWord((w) => (w + 1) % WORDS.length), 2200);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !(e.target as HTMLElement)?.closest("a,button,input")) onEnter();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onEnter]);

  // Pins/plates follow the live camera without React renders.
  useEffect(() => {
    if (!scene) return;
    return scene.onCamera((c) => {
      const el = root.current;
      if (!el) return;
      el.style.setProperty("--tx", String(c.tx));
      el.style.setProperty("--ty", String(c.ty));
      el.style.setProperty("--s", String(c.s));
    });
  }, [scene]);

  // The camera drifts gently around the map centre; meanwhile a random point that is currently
  // on the right side of the screen gets locked on, then the next one, and so on.
  useEffect(() => {
    if (!scene) return;
    let alive = true;
    let n = 0;
    let last: Stop | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const { min, max } = scene.zoomRange();
    // a little above fit, so the drift has room to move both ways without hitting the map edge
    const zoom = Math.min(max, min * 1.6);
    const cx = atlas.width / 2, cy = atlas.height / 2;
    // Anchor: the rewarded mission nearest the map centre (welcome padding puts it on the right
    // side of the screen). The camera only sways a little around it, never travels.
    const anchor = [...missions].sort((p, q) => Math.hypot(p.x - cx, p.y - cy) - Math.hypot(q.x - cx, q.y - cy))[0];
    const [ax, ay] = anchor ? [anchor.x, anchor.y] : [cx, cy];
    const R = Math.min(atlas.width, atlas.height) * 0.022;
    let a = Math.random() * Math.PI * 2;
    const drift = () => {
      if (!alive) return;
      a += 0.8 + Math.random() * 0.5;
      scene.flyTo(ax + Math.cos(a) * R, ay + Math.sin(a) * R * 0.7, zoom, DRIFT_MS);
      timers.push(setTimeout(drift, DRIFT_MS));
    };
    const scans: Stop[] = ARTWORK_LOTS.map(([lx, ly]) => ({ kind: "scan" as const, x: lx * atlas.width, y: ly * atlas.height }));
    /** Stops currently on the right side of the screen, with room for the plate. */
    const onRight = (pool: Stop[]) => {
      const el = root.current;
      if (!el) return [];
      const w = el.clientWidth, h = el.clientHeight;
      const cam = scene.camera();
      return pool.filter((p) => {
        const sx = p.x * cam.s + cam.tx, sy = p.y * cam.s + cam.ty;
        return sx > w * 0.5 && sx < w - 320 && sy > 150 && sy < h - 140;
      });
    };
    const pick = (): Stop | null => {
      // rewarded missions in view first (repeat allowed when only one is visible)
      const m = onRight(missions);
      if (m.length) {
        const fresh = m.filter((x) => x !== last);
        const pool = fresh.length ? fresh : m;
        return pool[Math.floor(Math.random() * pool.length)]!;
      }
      if (missions.length) return null; // wait for the sway to bring one back into view
      const sc = onRight(scans).filter((x) => x !== last);
      return sc[Math.floor(Math.random() * sc.length)] ?? null;
    };
    const step = () => {
      if (!alive) return;
      const p = pick();
      if (p) {
        last = p;
        setStop({ s: p, n: ++n, flip: false });
      }
      timers.push(setTimeout(step, p ? HOLD_MS + GAP_MS : 400));
    };
    scene.jumpTo(ax, ay, zoom);
    timers.push(setTimeout(drift, 60), setTimeout(step, 800));
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [scene, missions, atlas]);

  const at = (x: number, y: number) => ({ transform: `translate(calc(${x} * var(--s) * 1px + var(--tx) * 1px), calc(${y} * var(--s) * 1px + var(--ty) * 1px))` });
  const active = stop?.s;
  const tone = active?.kind === "mission" ? "#FF9138" : "#9fb3c8";
  const prize = active?.kind === "mission" ? (active.b.topPrize ?? active.b.featured!.prize) : null;
  const rate = prize ? rewardRate(prize).perDay : null;
  const grid = active ? `${String(Math.round(active.x)).padStart(4, "0")} · ${String(Math.round(active.y)).padStart(4, "0")}` : "";

  return (
    <section
      ref={root}
      aria-labelledby="welcome-title"
      className={`absolute inset-0 z-40 overflow-hidden transition-[opacity,transform] duration-[420ms] ease-out ${leaving ? "pointer-events-none scale-[1.03] opacity-0" : "opacity-100"}`}
      style={{ ["--tx" as string]: 0, ["--ty" as string]: 0, ["--s" as string]: 0.2 }}
    >
      {/* readability gradient + slow scan sweep */}
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgb(5_7_10/0.95)_0%,rgb(5_7_10/0.82)_32%,rgb(5_7_10/0.15)_66%,rgb(5_7_10/0.3)_100%)]" />
      <div aria-hidden className="yv-scan absolute inset-x-0 h-[26%] bg-[linear-gradient(180deg,transparent,rgb(220_225_232/0.05),transparent)]" />

      {/* active lock-on */}
      {active && (
        <div aria-hidden key={stop!.n} className={`pointer-events-none absolute left-0 top-0 hidden lg:block ${stop!.flip ? "yv-flip" : ""}`} style={at(active.x, active.y)}>
          {/* reticle snaps in */}
          <svg width="104" height="104" viewBox="0 0 104 104" className="yv-lock absolute -left-[52px] -top-[52px]">
            <circle cx="52" cy="52" r="34" fill="none" stroke={tone} strokeOpacity=".55" strokeWidth="1.5" strokeDasharray="6 7" className="yv-spin-slow" style={{ transformOrigin: "52px 52px", animationDuration: "8s" }} />
            <circle cx="52" cy="52" r="22" fill={tone} fillOpacity=".08" stroke={tone} strokeOpacity=".9" strokeWidth="1.5" />
            {["M14 28 V14 H28", "M76 14 H90 V28", "M90 76 V90 H76", "M28 90 H14 V76"].map((d) => (
              <path key={d} d={d} fill="none" stroke={tone} strokeWidth="2" />
            ))}
            <path d="M52 22 V34 M52 70 V82 M22 52 H34 M70 52 H82" stroke={tone} strokeOpacity=".7" strokeWidth="1.2" />
            <circle cx="52" cy="52" r="4" fill={tone} />
            <circle cx="52" cy="52" r="4" fill="none" stroke={tone} strokeWidth="2" style={{ animation: "yv-ping 1.8s ease-out infinite", transformOrigin: "52px 52px" }} />
          </svg>
          {/* leader line draws itself */}
          <svg width="96" height="64" viewBox="0 0 96 64" className="yv-line absolute left-6 -top-[62px]">
            <path d="M2 62 L34 10 L96 10" fill="none" stroke={tone} strokeWidth="1.5" pathLength={1} className="yv-draw" />
            <circle cx="2" cy="62" r="2.5" fill={tone} />
          </svg>
          {/* info plate wipes open */}
          <div
            className="yv-plate absolute left-[120px] -top-[90px] w-[260px] bg-[#05070ae8] px-3.5 py-2.5 font-mono backdrop-blur-sm"
            style={frame(14, `${tone}66`)}
          >
            <p className="yv-row flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: tone, animationDelay: "900ms" }}>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 animate-pulse rounded-full" style={{ background: tone }} />
                {active.kind === "mission" ? (active.b.featured!.template === "treasure_hunt" ? "Mission" : "Challenge") : "Scanning sector"}
              </span>
              <span className="text-[rgb(214_219_225/.45)]">#{String(stop!.n).padStart(2, "0")}</span>
            </p>
            {active.kind === "mission" ? (
              <>
                <p className="yv-row mt-1 font-display text-[15px] font-bold uppercase tracking-[0.04em] text-ink" style={{ animationDelay: "1050ms" }}>
                  {active.b.featured!.title}
                </p>
                <p className="yv-row text-[10.5px] uppercase tracking-[0.16em] text-[rgb(214_219_225/.55)]" style={{ animationDelay: "1150ms" }}>
                  {active.b.name}
                </p>
                {prize ? (
                  <div className="yv-row -mx-3.5 -mb-2.5 mt-2 border-t border-dashed border-[rgb(255_194_75/.4)] bg-[linear-gradient(90deg,rgb(255_194_75/.12),rgb(255_194_75/.02))] px-3.5 pb-2.5 pt-1.5" style={{ animationDelay: "1300ms" }}>
                    <div className="flex items-center justify-between text-[9.5px] font-bold uppercase tracking-[0.22em]">
                      <span className="text-[rgb(255_194_75/.8)]">Reward</span>
                      {rate ? <span className="text-mint-ink">{formatRate(rate, prize.symbol)}</span> : <span className="text-[rgb(214_219_225/.45)]">Fixed</span>}
                    </div>
                    <p className="mt-0.5 font-display text-[17px] font-bold text-reward">
                      <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgb(255_194_75/.75)]">Up to</span>
                      <LiveReward prize={prize} />
                    </p>
                  </div>
                ) : (
                  <div className="yv-row mt-2 flex items-center justify-between border-t border-[rgb(214_219_225/.12)] pt-1.5 text-[10px] uppercase tracking-[0.16em]" style={{ animationDelay: "1300ms" }}>
                    <span className="text-[rgb(214_219_225/.5)]">Objective</span>
                    <span className="text-[rgb(214_219_225/.8)]">{active.b.featured!.template === "treasure_hunt" ? "Solve the clues" : "Submit an idea"}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="yv-row mt-1 font-display text-[15px] font-bold uppercase tracking-[0.04em] text-ink" style={{ animationDelay: "1050ms" }}>
                  Grid {grid}
                </p>
                <div className="yv-row mt-2 h-1 overflow-hidden bg-[rgb(214_219_225/.1)]" style={{ animationDelay: "1150ms" }}>
                  <div className="yv-bar h-full bg-[rgb(159_179_200/.7)]" />
                </div>
                <p className="yv-row mt-1.5 text-[10px] uppercase tracking-[0.16em] text-[rgb(214_219_225/.5)]" style={{ animationDelay: "1250ms" }}>
                  Searching for signals…
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* content */}
      <div className="relative flex h-full flex-col justify-center overflow-y-auto px-6 py-10 sm:px-12 lg:px-20">
        <div className="max-w-[640px]">
          <div className="yv-rise" style={{ animationDelay: "60ms" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/brand/yielvy-logo.webp" alt="Yielvy" className="h-10 w-auto sm:h-12" />
          </div>
          <h1 id="welcome-title" className="yv-rise mt-8 text-[40px] font-bold leading-[0.98] tracking-[-0.035em] sm:text-[58px] xl:text-[72px]" style={{ animationDelay: "200ms" }}>
            Explore. Play.
            <br />
            <span className="text-reward">Earn.</span>
          </h1>
          <p className="yv-rise mt-5 max-w-[500px] text-[15px] leading-relaxed text-ink-2 sm:text-[17px]" style={{ animationDelay: "320ms" }}>
            A living map of{" "}
            <span key={word} className="yv-word inline-block font-semibold text-ink">
              {WORDS[word]}
            </span>
            . Complete missions, claim the prize.
          </p>
          <div className="yv-rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "440ms" }}>
            {/* primary: angled orange plate with a light sweep */}
            <button
              type="button"
              onClick={onEnter}
              autoFocus
              className="yv-cta group relative flex h-14 items-center gap-3 overflow-hidden bg-[linear-gradient(180deg,#ffa458,#ff8a2a)] px-8 font-mono text-[#140c05] shadow-[0_0_28px_rgb(255_145_56/.45)] outline-none transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgb(255_145_56/.65)] focus-visible:ring-2 focus-visible:ring-white"
              style={plate(14)}
            >
              <span className="text-[16px] font-black uppercase tracking-[0.16em]">Enter the world</span>
              <IconChevron size={18} className="ml-1 transition-transform group-hover:translate-x-1" />
              <span aria-hidden className="yv-sweep pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 skew-x-[-20deg] bg-white/35" />
            </button>
            {/* secondary: dark glass plate, dotted like the host tile in the game */}
            <Link
              href="/host?from=home"
              className="group relative flex h-14 items-center bg-[rgb(5_7_10/.72)] px-7 font-mono text-white backdrop-blur-md transition-transform hover:-translate-y-0.5"
              style={plate(14)}
            >
              <span aria-hidden className="pointer-events-none absolute inset-0 transition-opacity group-hover:opacity-0" style={frame(14, "rgb(214 219 225 / .3)")} />
              <span aria-hidden className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100" style={frame(14, "rgb(255 145 56 / .8)")} />
              <span className="text-[14px] font-bold uppercase tracking-[0.16em]">Host a mission</span>
            </Link>
          </div>
          <div className="yv-rise mt-8" style={{ animationDelay: "520ms" }}>
            <button
              type="button"
              onClick={() => setHow(true)}
              className="group flex h-9 items-center gap-2 px-2 font-mono text-[11.5px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.65)] transition-colors hover:text-white"
            >
              <span className="grid size-6 place-items-center border border-[rgb(214_219_225/.35)] text-[11px] transition-colors group-hover:border-orange group-hover:text-orange">?</span>
              How it works
            </button>
          </div>
        </div>
      </div>

      <Tutorial open={how} onClose={() => setHow(false)} onStart={onEnter} />

      <style>{`
        @keyframes yv-sweep { 0%, 55% { transform: translateX(0) skewX(-20deg) } 100% { transform: translateX(520%) skewX(-20deg) } }
        .yv-sweep { animation: yv-sweep 3.4s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .yv-sweep { animation: none; display: none } }
        @keyframes yv-rise { from { opacity: 0; transform: translateY(14px); filter: blur(4px) } to { opacity: 1; transform: none; filter: none } }
        .yv-rise { animation: yv-rise 700ms cubic-bezier(.2,.7,.2,1) both }
        @keyframes yv-scan { from { top: -30% } to { top: 100% } }
        .yv-scan { animation: yv-scan 8s linear infinite }
        @keyframes yv-word { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        .yv-word { animation: yv-word 380ms ease-out both }
        @keyframes yv-ping { 0% { transform: scale(1); opacity: .9 } 100% { transform: scale(4.5); opacity: 0 } }
        /* lock-on: reticle snaps in → line draws → plate wipes open → rows appear; all fade before the next stop */
        @keyframes yv-lock-in { 0% { opacity: 0; transform: scale(2.2) rotate(45deg) } 60% { opacity: 1 } 100% { opacity: 1; transform: none } }
        .yv-lock { animation: yv-lock-in 520ms cubic-bezier(.2,.8,.2,1) both, yv-out 400ms ease-in ${HOLD_MS - 450}ms forwards }
        @keyframes yv-draw-in { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
        .yv-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: yv-draw-in 420ms ease-out 450ms forwards }
        .yv-line { animation: yv-out 400ms ease-in ${HOLD_MS - 450}ms forwards }
        @keyframes yv-wipe { from { clip-path: inset(0 100% 0 0) } to { clip-path: inset(0 0 0 0) } }
        .yv-plate { animation: yv-wipe 380ms cubic-bezier(.2,.8,.2,1) 820ms both, yv-out 400ms ease-in ${HOLD_MS - 450}ms forwards }
        @keyframes yv-row-in { from { opacity: 0; transform: translateX(-6px) } to { opacity: 1; transform: none } }
        .yv-row { animation: yv-row-in 260ms ease-out both }
        @keyframes yv-bar-fill { from { width: 0 } to { width: 100% } }
        .yv-bar { animation: yv-bar-fill 2400ms linear 1200ms both }
        @keyframes yv-out { to { opacity: 0 } }
        .yv-flip .yv-line { left: auto; right: 24px; transform: scaleX(-1) }
        .yv-flip .yv-plate { left: auto; right: 120px }
      `}</style>
    </section>
  );
}
