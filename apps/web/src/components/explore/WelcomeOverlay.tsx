"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Atlas } from "@yielvy/core/world";
import type { AtlasScene } from "@/world/atlas-scene";
import type { WorldBuildingData } from "@/world/types";
import { buttonClass } from "@/components/ui";
import { CoinStack, TreasureChest, TreasureMap } from "@/components/art/Art";
import { IconChevron } from "./icons";

/**
 * Opening scene: the real map (with the tactical HUD) behind a short headline, and targeting
 * callouts locked onto real live missions. Every name and prize shown comes from real data.
 */
const WORDS = ["secret missions", "hidden rewards", "real prizes"];

const HOW = [
  { art: TreasureMap, title: "Explore", body: "Scan the map for glowing mission pins." },
  { art: CoinStack, title: "Play", body: "Solve the clues. Stuck? Unlock a hint with an activity." },
  { art: TreasureChest, title: "Earn", body: "Finish the mission to qualify for the prize." },
];

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

  useEffect(() => {
    const t = setInterval(() => setWord((w) => (w + 1) % WORDS.length), 2200);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHow(false);
      if (e.key === "Enter" && !(e.target as HTMLElement)?.closest("a,button,input")) onEnter();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onEnter]);

  // Callouts follow the live camera without React renders.
  useEffect(() => {
    if (!scene) return;
    scene.cinematic();
    return scene.onCamera((c) => {
      const el = root.current;
      if (!el) return;
      el.style.setProperty("--tx", String(c.tx));
      el.style.setProperty("--ty", String(c.ty));
      el.style.setProperty("--s", String(c.s));
      // Show a callout only when the whole thing (reticle + plate) fits on the map side of the screen.
      const w = el.clientWidth, h = el.clientHeight;
      el.querySelectorAll<HTMLElement>("[data-callout]").forEach((n) => {
        const [px, py] = n.dataset.callout!.split(",").map(Number);
        const sx = px! * c.s + c.tx, sy = py! * c.s + c.ty;
        // Near the right edge the plate flips to the left of the reticle instead of being cut off.
        const flip = sx > w - 380;
        n.dataset.flip = flip ? "1" : "0";
        const ok = (flip ? sx - 380 > w * 0.46 && sx < w - 40 : sx > w * 0.5) && sy > 120 && sy < h - 60;
        n.style.opacity = ok ? "1" : "0";
      });
    });
  }, [scene]);

  const at = (x: number, y: number) => ({ transform: `translate(calc(${x} * var(--s) * 1px + var(--tx) * 1px), calc(${y} * var(--s) * 1px + var(--ty) * 1px))` });
  const live = buildings.filter((b) => b.liveCampaigns > 0 && b.featured).slice(0, 3);
  const callouts = live.map((b, i) => ({
    b,
    i,
    p: [b.x * atlas.width, b.y * atlas.height] as const,
    hunt: b.featured!.template === "treasure_hunt",
    prize: b.featured!.prize ? `${b.featured!.prize.amount} ${b.featured!.prize.symbol}` : b.featured!.rewards === "token" ? "TOKEN PRIZE" : null,
  }));

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

      {/* targeting callouts on real live missions */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
        {callouts.map((c) => {
          const tone = c.hunt ? "#FF9138" : "#B9A8FF";
          return (
            <div key={c.b.spaceId} data-callout={`${c.p[0]},${c.p[1]}`} className="absolute left-0 top-0 transition-opacity duration-500" style={at(c.p[0], c.p[1])}>
              <div className="yv-callout relative" style={{ animationDelay: `${700 + c.i * 500}ms` }}>
                {/* reticle */}
                <svg width="96" height="96" viewBox="0 0 96 96" className="absolute -left-12 -top-12">
                  <circle cx="48" cy="48" r="30" fill="none" stroke={tone} strokeOpacity=".55" strokeWidth="1.5" strokeDasharray="6 7" className="yv-spin-slow" style={{ transformOrigin: "48px 48px", animationDuration: "9s" }} />
                  <circle cx="48" cy="48" r="20" fill={tone} fillOpacity=".08" stroke={tone} strokeOpacity=".9" strokeWidth="1.5" />
                  {[
                    "M14 26 V14 H26",
                    "M70 14 H82 V26",
                    "M82 70 V82 H70",
                    "M26 82 H14 V70",
                  ].map((d) => (
                    <path key={d} d={d} fill="none" stroke={tone} strokeWidth="2" />
                  ))}
                  <circle cx="48" cy="48" r="4" fill={tone} />
                  <circle cx="48" cy="48" r="4" fill="none" stroke={tone} strokeWidth="2" style={{ animation: "yv-ping 1.8s ease-out infinite", transformOrigin: "48px 48px" }} />
                </svg>
                {/* leader line */}
                <svg width="90" height="60" viewBox="0 0 90 60" className="yv-cl-line absolute left-5 -top-[58px]">
                  <path d="M2 58 L32 10 L90 10" fill="none" stroke={tone} strokeWidth="1.5" strokeOpacity=".85" />
                </svg>
                {/* label */}
                <div
                  className="yv-cl-plate absolute left-[110px] -top-[84px] w-[250px] bg-[#05070ae6] px-3.5 py-2.5 font-mono backdrop-blur-sm"
                  style={{ clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))", boxShadow: `inset 0 0 0 1px ${tone}66` }}
                >
                  <p className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: tone }}>
                    <span className="flex items-center gap-1.5">
                      <span className="size-1.5 animate-pulse rounded-full" style={{ background: tone }} />
                      {c.hunt ? "Mission live" : "Challenge live"}
                    </span>
                    <span className="text-[rgb(214_219_225/.45)]">#{String(c.i + 1).padStart(2, "0")}</span>
                  </p>
                  <p className="mt-1 font-display text-[15px] font-bold uppercase tracking-[0.04em] text-ink">{c.b.featured!.title}</p>
                  <p className="text-[10.5px] uppercase tracking-[0.16em] text-[rgb(214_219_225/.55)]">{c.b.name}</p>
                  <div className="mt-2 flex items-center justify-between border-t border-[rgb(214_219_225/.12)] pt-1.5 text-[10px] uppercase tracking-[0.16em]">
                    <span className="text-[rgb(214_219_225/.5)]">{c.prize ? "Reward" : "Objective"}</span>
                    <span className={c.prize ? "font-bold text-reward" : "text-[rgb(214_219_225/.8)]"}>{c.prize ?? (c.hunt ? "Solve the clues" : "Submit an idea")}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

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
            <button type="button" onClick={onEnter} autoFocus className={buttonClass("primary", "lg", "group yv-glow h-14 px-8 text-[16px]")}>
              Enter the World
              <IconChevron size={18} className="transition-transform group-hover:translate-x-1" />
            </button>
            <Link href="/host" className={buttonClass("dark", "lg", "h-14 px-6")}>
              Host a mission
            </Link>
            <button type="button" onClick={() => setHow(true)} className="h-14 px-3 text-[14px] font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline">
              How it works
            </button>
          </div>
        </div>
      </div>

      {/* how it works */}
      {how && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setHow(false)}>
          <div
            role="dialog"
            aria-label="How it works"
            className="yv-pop relative w-full max-w-[760px] bg-[#07090ce6] p-6 sm:p-8"
            style={{ clipPath: "polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px))", boxShadow: "inset 0 0 0 1px rgb(214 219 225 / .18)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-orange">Briefing</p>
            <h2 className="mt-1 text-[28px] font-bold">How it works</h2>
            <ol className="yv-stagger mt-6 grid gap-3 sm:grid-cols-3">
              {HOW.map((h, i) => (
                <li key={h.title} className="border border-[rgb(214_219_225/.12)] bg-[#0b0e13] p-4">
                  <p className="font-mono text-[11px] tracking-[0.25em] text-[rgb(214_219_225/.45)]">0{i + 1}</p>
                  <h.art size={84} className="mx-auto my-2" />
                  <p className="font-display text-[18px] font-bold">{h.title}</p>
                  <p className="mt-1 text-[13px] text-ink-2">{h.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={onEnter} className={buttonClass("primary", "md")}>
                Start exploring →
              </button>
              <button type="button" onClick={() => setHow(false)} className={buttonClass("ghost", "md")}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes yv-rise { from { opacity: 0; transform: translateY(14px); filter: blur(4px) } to { opacity: 1; transform: none; filter: none } }
        .yv-rise { animation: yv-rise 700ms cubic-bezier(.2,.7,.2,1) both }
        @keyframes yv-scan { from { top: -30% } to { top: 100% } }
        .yv-scan { animation: yv-scan 8s linear infinite }
        @keyframes yv-word { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        .yv-word { animation: yv-word 380ms ease-out both }
        @keyframes yv-callout { from { opacity: 0; transform: scale(.8) } to { opacity: 1; transform: none } }
        .yv-callout { animation: yv-callout 600ms cubic-bezier(.2,.7,.2,1) both }
        [data-flip="1"] .yv-cl-line { left: auto; right: 20px; transform: scaleX(-1) }
        [data-flip="1"] .yv-cl-plate { left: auto; right: 110px }
        @keyframes yv-ping { 0% { transform: scale(1); opacity: .9 } 100% { transform: scale(4.5); opacity: 0 } }
      `}</style>
    </section>
  );
}
