"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Atlas } from "@yielvy/core/world";
import type { AtlasScene } from "@/world/atlas-scene";
import type { WorldBuildingData } from "@/world/types";
import { buttonClass } from "@/components/ui";
import { IconChevron, IconCompass, IconFlag, IconSparkle, IconStar } from "./icons";

/**
 * Cinematic first-visit scene. The real map does the storytelling: HUD callouts are pinned
 * to real Spaces (a live hunt, a live contest, one more) and say what happens there.
 * All numbers shown are real counts from the database (or nothing).
 */
const WORDS = ["projects", "treasure hunts", "creative challenges", "real rewards"];

const STEPS = [
  { n: "01", icon: IconCompass, title: "Explore the map", body: "Every marker is a real project's Space.", color: "#FF9138" },
  { n: "02", icon: IconFlag, title: "Take on a challenge", body: "Solve treasure hunts or submit ideas.", color: "#32C8EF" },
  { n: "03", icon: IconSparkle, title: "Qualify for rewards", body: "Projects fund prizes for those who finish.", color: "#9B87F5" },
];

export function WelcomeOverlay({
  atlas,
  scene,
  buildings,
  leaving,
  onEnter,
  stats,
}: {
  atlas: Atlas;
  buildings: WorldBuildingData[];
  scene: AtlasScene | null;
  leaving: boolean;
  onEnter(): void;
  stats: { spaces: number; live: number; hunts: number; contests: number };
}) {
  const root = useRef<HTMLDivElement>(null);
  const coords = useRef<HTMLParagraphElement>(null);
  const [word, setWord] = useState(0);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setWord((w) => (w + 1) % WORDS.length), 2200);
    const s = setInterval(() => setStep((x) => (x + 1) % 3), 1800);
    const onKey = (e: KeyboardEvent) => e.key === "Enter" && !(e.target as HTMLElement)?.closest("a,button,input") && onEnter();
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(t);
      clearInterval(s);
      window.removeEventListener("keydown", onKey);
    };
  }, [onEnter]);

  // Callouts and the coordinate readout follow the live camera without React renders.
  useEffect(() => {
    if (!scene) return;
    scene.cinematic();
    return scene.onCamera((c) => {
      const el = root.current;
      if (el) {
        el.style.setProperty("--tx", String(c.tx));
        el.style.setProperty("--ty", String(c.ty));
        el.style.setProperty("--s", String(c.s));
      }
      if (coords.current) {
        const v = scene.viewport();
        coords.current.textContent = `${(41 + v.y * 2).toFixed(4)}° N   ${(12 + v.x * 3).toFixed(4)}° E   Z ${c.s.toFixed(2)}`;
      }
    });
  }, [scene]);

  const at = (x: number, y: number) => ({ transform: `translate(calc(${x} * var(--s) * 1px + var(--tx) * 1px), calc(${y} * var(--s) * 1px + var(--ty) * 1px))` });
  // Callouts sit on real Spaces only: a live hunt, a live contest, and one more Space.
  const hunt = buildings.find((b) => b.liveCampaigns > 0 && b.kind === "hunt");
  const contest = buildings.find((b) => b.liveCampaigns > 0 && b.kind === "contest");
  const other = buildings.find((b) => b !== hunt && b !== contest);
  const callouts = [
    other && { b: other, title: other.name, text: "Every marker on the map is a real project’s Space", color: "#FF9138", icon: IconCompass },
    hunt && { b: hunt, title: hunt.name, text: "Treasure hunt live: follow clues, solve questions", color: "#32C8EF", icon: IconFlag },
    contest && { b: contest, title: contest.name, text: "Creative contest live: submit your best idea", color: "#9B87F5", icon: IconStar },
  ]
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({ ...c, p: [c.b.x * atlas.width, c.b.y * atlas.height] as const }));

  return (
    <section
      ref={root}
      aria-labelledby="welcome-title"
      className={`absolute inset-0 z-40 overflow-hidden transition-[opacity,transform] duration-[420ms] ease-out ${leaving ? "pointer-events-none scale-[1.03] opacity-0" : "opacity-100"}`}
      style={{ ["--tx" as string]: 0, ["--ty" as string]: 0, ["--s" as string]: 0.2 }}
    >
      {/* readability gradient, scan line, vignette */}
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgb(5_7_10/0.97)_0%,rgb(5_7_10/0.88)_34%,rgb(5_7_10/0.2)_68%,rgb(5_7_10/0.35)_100%)]" />
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_68%_45%,transparent_35%,rgb(5_7_10/0.75)_100%)]" />
      <div aria-hidden className="yv-scan absolute inset-x-0 h-[30%] bg-[linear-gradient(180deg,transparent,rgb(50_200_239/0.07),transparent)]" />

      {/* callouts pinned to real Spaces on the map */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
        {callouts.map((c, i) => (
          <div key={c.b.spaceId} className="absolute left-0 top-0" style={at(c.p[0], c.p[1])}>
            <div className="yv-callout relative" style={{ animationDelay: `${600 + i * 450}ms` }}>
              <span className="absolute -left-[7px] -top-[7px] size-3.5 rounded-full border-2" style={{ borderColor: c.color, boxShadow: `0 0 0 6px ${c.color}22` }} />
              <span className="absolute left-0 top-0 h-px w-14 origin-left -rotate-[28deg]" style={{ background: c.color }} />
              <div className="absolute left-12 -top-[58px] w-60 border-l-2 bg-[#05070acc] px-3 py-2 backdrop-blur-sm" style={{ borderColor: c.color }}>
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: c.color }}>
                  <c.icon size={11} className="mr-1 inline" />
                  {c.title}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-ink">{c.text}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* HUD frame */}
      <div aria-hidden className="pointer-events-none absolute inset-4 sm:inset-6">
        {["left-0 top-0 border-l border-t", "right-0 top-0 border-r border-t", "left-0 bottom-0 border-l border-b", "right-0 bottom-0 border-r border-b"].map((c) => (
          <span key={c} className={`absolute size-6 border-ink-3/60 ${c}`} />
        ))}
      </div>
      <div className="absolute right-8 top-7 hidden text-right font-mono text-[11px] leading-relaxed tracking-wider text-ink-3 md:block">
        <p>
          <span className="mr-2 inline-block size-1.5 animate-pulse rounded-full bg-mint align-middle" />
          YIELVY WORLD · MAP v3
        </p>
        <p ref={coords}>—</p>
      </div>

      {/* content */}
      <div className="relative flex h-full flex-col justify-center overflow-y-auto px-6 py-10 sm:px-12 lg:px-20">
        <div className="max-w-[640px]">
          <div className="yv-rise flex items-center gap-3" style={{ animationDelay: "60ms" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/brand/yielvy-logo.webp" alt="Yielvy" className="h-10 w-auto sm:h-12" />
          </div>
          <p className="yv-rise mt-6 font-mono text-[12px] uppercase tracking-[0.32em] text-orange" style={{ animationDelay: "160ms" }}>
            &gt; Welcome to Yielvy<span className="yv-caret">_</span>
          </p>
          <h1 id="welcome-title" className="yv-rise mt-4 text-[40px] font-bold leading-[0.98] tracking-[-0.035em] sm:text-[58px] xl:text-[72px]" style={{ animationDelay: "240ms" }}>
            There&apos;s a world
            <br />
            <span className="bg-[linear-gradient(90deg,#FFB37A,#FF9138_45%,#32C8EF)] bg-clip-text text-transparent">worth exploring.</span>
          </h1>
          <p className="yv-rise mt-5 max-w-[520px] text-[15px] leading-relaxed text-ink-2 sm:text-[17px]" style={{ animationDelay: "340ms" }}>
            A living map of{" "}
            <span key={word} className="yv-word inline-block font-semibold text-ink">
              {WORDS[word]}
            </span>
            . Enter a project&apos;s Space, take on its challenges, and qualify for the rewards it puts up.
          </p>

          <div className="yv-rise mt-7 flex flex-wrap items-center gap-3" style={{ animationDelay: "440ms" }}>
            <button type="button" onClick={onEnter} autoFocus className={buttonClass("primary", "lg", "group h-14 px-8 text-[16px]")}>
              Enter the World
              <IconChevron size={18} className="transition-transform group-hover:translate-x-1" />
            </button>
            <Link href="/host" className={buttonClass("dark", "lg", "h-14 px-6")}>
              Host a Space
            </Link>
            <span className="hidden font-mono text-[11px] tracking-wider text-ink-3 sm:inline">
              or press <kbd className="rounded border border-line-strong px-1.5 py-0.5 text-ink-2">Enter ↵</kbd>
            </span>
          </div>

          {stats.spaces > 0 && (
            <p className="yv-rise mt-5 font-mono text-[12px] tracking-wider text-ink-3" style={{ animationDelay: "520ms" }}>
              <span className="text-ink">{stats.spaces}</span> SPACES OPEN · <span className="text-sky">{stats.hunts}</span> TREASURE HUNTS ·{" "}
              <span className="text-violet">{stats.contests}</span> CONTESTS LIVE
            </p>
          )}
        </div>

        <ol className="yv-rise mt-8 grid max-w-[760px] gap-3 sm:grid-cols-3" style={{ animationDelay: "620ms" }}>
          {STEPS.map((s, i) => (
            <li
              key={s.n}
              className="relative overflow-hidden rounded-[12px] border bg-[#0b0f15cc] px-4 py-3 backdrop-blur transition-colors duration-500"
              style={{ borderColor: step === i ? `${s.color}aa` : "var(--color-line)" }}
            >
              <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] transition-opacity duration-500" style={{ background: s.color, opacity: step === i ? 1 : 0.2 }} />
              <p className="flex items-center justify-between font-mono text-[11px] tracking-[0.2em]" style={{ color: s.color }}>
                {s.n}
                <s.icon size={16} />
              </p>
              <p className="mt-2 font-semibold">{s.title}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>

      <style>{`
        @keyframes yv-rise { from { opacity: 0; transform: translateY(14px); filter: blur(4px) } to { opacity: 1; transform: none; filter: none } }
        .yv-rise { animation: yv-rise 700ms cubic-bezier(.2,.7,.2,1) both }
        @keyframes yv-scan { from { top: -30% } to { top: 100% } }
        .yv-scan { animation: yv-scan 7s linear infinite }
        @keyframes yv-caret { 50% { opacity: 0 } }
        .yv-caret { animation: yv-caret 1s steps(1) infinite }
        @keyframes yv-word { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        .yv-word { animation: yv-word 380ms ease-out both }
        @keyframes yv-callout { from { opacity: 0; transform: scale(.85) } to { opacity: 1; transform: none } }
        .yv-callout { animation: yv-callout 600ms cubic-bezier(.2,.7,.2,1) both }
      `}</style>
    </section>
  );
}
