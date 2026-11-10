"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { buttonClass } from "@/components/ui";

/** Shown once per browser on the first visit to the game. */
export const TUTORIAL_KEY = "yv.tutorial.v1";
export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === "1";
  } catch {
    return true; // storage blocked: don't nag every visit
  }
}
export function markTutorialSeen() {
  try {
    localStorage.setItem(TUTORIAL_KEY, "1");
  } catch {
    /* ignore */
  }
}

export type Side = "player" | "company";

interface Step {
  icon: string;
  tag: string;
  title: string;
  body: string;
  objectives: string[];
  /** Extra panel for the reward explainer. */
  rewards?: boolean;
}

const ICON = {
  explore: "/assets/ui/icon-explore.webp",
  play: "/assets/ui/icon-play.webp",
  earn: "/assets/ui/icon-earn.webp",
  host: "/assets/ui/icon-host.webp",
  profile: "/assets/ui/icon-profile.webp",
};

const STEPS: Record<Side, Step[]> = {
  player: [
    {
      icon: ICON.explore,
      tag: "Explore",
      title: "Scan the map",
      body: "Every orange pin is a live mission. A gold $ badge means there is a reward to win.",
      objectives: ["Drag to move, scroll to zoom", "Hover a pin to see its reward", "Tap SEARCH to find a mission"],
    },
    {
      icon: ICON.play,
      tag: "Play",
      title: "Take on a mission",
      body: "Open a mission and follow its brief: crack the clues of a hunt or submit your best entry to a challenge.",
      objectives: ["Read the mission brief", "Solve clues or submit an entry", "Stuck? Unlock a hint with a partner activity"],
    },
    {
      icon: ICON.earn,
      tag: "Earn",
      title: "Claim the prize",
      body: "Finish the mission to qualify. Winners claim their reward straight to their NEAR wallet.",
      objectives: ["Complete every step", "Get picked as a winner", "Claim USDC to your wallet"],
    },
    {
      icon: ICON.earn,
      tag: "Rewards",
      title: "How rewards work",
      body: "Prize money sits in an on-chain vault, never with Yielvy. There are two kinds of reward:",
      objectives: [],
      rewards: true,
    },
  ],
  company: [
    {
      icon: ICON.profile,
      tag: "Set up",
      title: "Create your project",
      body: "Add your project's name, logo and story. We review it, then it gets its own spot on the map.",
      objectives: ["Sign in and create a project", "Pass a quick review", "Get a place on the map"],
    },
    {
      icon: ICON.host,
      tag: "Build",
      title: "Design a mission",
      body: "Pick a format (a clue hunt or a creative challenge), write the brief and set the dates.",
      objectives: ["Choose hunt or challenge", "Write clues and rules", "Schedule start and end"],
    },
    {
      icon: ICON.earn,
      tag: "Fund",
      title: "Fund the reward",
      body: "Deposit USDC into the vault. It is supplied to RHEA lending and only the interest becomes the prize, so your deposit stays yours. You can also add a fixed bonus on top.",
      objectives: ["Deposit stays yours, withdraw it later", "Interest grows the prize every day", "Optional fixed bonus"],
    },
    {
      icon: ICON.explore,
      tag: "Launch",
      title: "Go live",
      body: "Your mission shows up as a pin. Players find it, play, and the vault pays the winners directly.",
      objectives: ["Mission appears on the map", "Track players and entries", "Winners paid on-chain"],
    },
  ],
};

/** Game-style tutorial: two tracks (player / company), step by step with objectives. */
export function Tutorial({ open, onClose, onStart, initialSide = "player" }: { open: boolean; onClose(): void; onStart?(): void; initialSide?: Side }) {
  const [side, setSide] = useState<Side>(initialSide);
  const [i, setI] = useState(0);
  const steps = STEPS[side];
  const step = steps[i]!;
  const last = i === steps.length - 1;

  useEffect(() => {
    if (open) {
      setSide(initialSide);
      setI(0);
    }
  }, [open, initialSide]);

  const close = useCallback(() => {
    markTutorialSeen();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((n) => Math.min(steps.length - 1, n + 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, steps.length, close]);

  if (!open) return null;
  const cut = (c: number) => `polygon(0 0, calc(100% - ${c}px) 0, 100% ${c}px, 100% 100%, ${c}px 100%, 0 calc(100% - ${c}px))`;
  const ink = "rgb(214 219 225";

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-3 backdrop-blur-[3px]" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="How it works"
        className="yv-tut relative w-full max-w-[860px] overflow-hidden bg-[#06080bf2] font-mono"
        style={{ clipPath: cut(24), boxShadow: `inset 0 0 0 1px ${ink} / .16)` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header: track switch + skip */}
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3 sm:px-7" style={{ borderColor: `${ink} / .1)` }}>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.32em] text-orange">Tutorial</span>
            <div role="tablist" aria-label="Track" className="flex gap-1">
              {(["player", "company"] as const).map((s) => (
                <button
                  key={s}
                  role="tab"
                  type="button"
                  aria-selected={side === s}
                  onClick={() => {
                    setSide(s);
                    setI(0);
                  }}
                  className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors ${side === s ? "bg-orange text-[#140c05]" : "text-[rgb(214_219_225/.55)] hover:text-white"}`}
                  style={{ clipPath: cut(7) }}
                >
                  {s === "player" ? "I'm a player" : "I'm a company"}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={close} className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[rgb(214_219_225/.5)] hover:text-white">
            Skip ✕
          </button>
        </div>

        {/* progress */}
        <div className="flex gap-1.5 px-5 pt-4 sm:px-7">
          {steps.map((s, n) => (
            <button key={s.tag} type="button" onClick={() => setI(n)} className="group flex-1 text-left" aria-label={`Step ${n + 1}: ${s.tag}`}>
              <span className="block h-1 overflow-hidden" style={{ background: `${ink} / .1)` }}>
                <span className={`block h-full bg-orange transition-[width] duration-500 ${n <= i ? "w-full" : "w-0"}`} />
              </span>
              <span className={`mt-1.5 block text-[9.5px] font-bold uppercase tracking-[0.22em] ${n === i ? "text-orange" : "text-[rgb(214_219_225/.4)] group-hover:text-[rgb(214_219_225/.7)]"}`}>
                0{n + 1} · {s.tag}
              </span>
            </button>
          ))}
        </div>

        {/* stage */}
        <div key={`${side}-${i}`} className="grid gap-6 px-5 py-6 sm:grid-cols-[230px_1fr] sm:px-7 sm:py-7">
          <div className="relative mx-auto grid size-[200px] place-items-center sm:size-[230px]">
            <svg aria-hidden viewBox="0 0 230 230" className="yv-tut-spin absolute inset-0 size-full">
              <circle cx="115" cy="115" r="106" fill="none" stroke="rgb(255 145 56 / .35)" strokeWidth="1.2" strokeDasharray="4 9" />
            </svg>
            <svg aria-hidden viewBox="0 0 230 230" className="absolute inset-0 size-full">
              <circle cx="115" cy="115" r="92" fill="rgb(255 145 56 / .05)" stroke="rgb(214 219 225 / .14)" strokeWidth="1" />
              {["M24 54V24H54", "M176 24H206V54", "M206 176V206H176", "M54 206H24V176"].map((d) => (
                <path key={d} d={d} fill="none" stroke="rgb(255 145 56 / .8)" strokeWidth="2" />
              ))}
            </svg>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={step.icon} alt="" className="yv-tut-icon relative w-[68%] drop-shadow-[0_10px_30px_rgb(255_145_56/.25)]" />
          </div>
          <div className="min-w-0">
            <p className="yv-tut-row text-[10px] font-bold uppercase tracking-[0.3em] text-[rgb(214_219_225/.45)]" style={{ animationDelay: "60ms" }}>
              {side === "player" ? "Player" : "Company"} · step {i + 1} of {steps.length}
            </p>
            <h2 className="yv-tut-row mt-1 font-display text-[28px] font-bold uppercase leading-tight tracking-[0.02em] text-white sm:text-[34px]" style={{ animationDelay: "120ms" }}>
              {step.title}
            </h2>
            <p className="yv-tut-row mt-2 font-sans text-[15px] leading-relaxed text-[rgb(214_219_225/.75)]" style={{ animationDelay: "200ms" }}>
              {step.body}
            </p>
            {step.objectives.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {step.objectives.map((o, n) => (
                  <li key={o} className="yv-tut-row flex items-center gap-2.5 text-[12px] uppercase tracking-[0.12em] text-[rgb(214_219_225/.85)]" style={{ animationDelay: `${300 + n * 110}ms` }}>
                    <span className="grid size-4 shrink-0 place-items-center border border-orange/70 text-[9px] text-orange">✓</span>
                    {o}
                  </li>
                ))}
              </ul>
            )}
            {step.rewards && (
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                <div className="yv-tut-row border border-[rgb(255_194_75/.35)] bg-[rgb(255_194_75/.05)] p-3" style={{ animationDelay: "300ms", clipPath: cut(10) }}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-reward">Growing reward</p>
                  <p className="mt-1 font-sans text-[13px] leading-snug text-[rgb(214_219_225/.75)]">
                    The project&apos;s deposit earns interest on RHEA lending. The interest is the prize, so the pool keeps growing every day.
                  </p>
                  <p className="mt-2 text-[11px] font-bold text-mint-ink">e.g. up to $1,375.00 · +$0.30/day</p>
                </div>
                <div className="yv-tut-row border border-[rgb(214_219_225/.18)] bg-[rgb(214_219_225/.03)] p-3" style={{ animationDelay: "420ms", clipPath: cut(10) }}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.8)]">Fixed reward</p>
                  <p className="mt-1 font-sans text-[13px] leading-snug text-[rgb(214_219_225/.75)]">
                    A set amount of USDC the project puts in up front. What you see is what the winners share.
                  </p>
                  <p className="mt-2 text-[11px] font-bold text-[rgb(214_219_225/.6)]">Paid in USDC to your NEAR wallet</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* controls */}
        <div className="flex items-center justify-between gap-3 border-t px-5 py-3.5 sm:px-7" style={{ borderColor: `${ink} / .1)` }}>
          <button
            type="button"
            disabled={i === 0}
            onClick={() => setI((n) => n - 1)}
            className="text-[11px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.6)] hover:text-white disabled:opacity-30"
          >
            ← Back
          </button>
          <span className="hidden text-[10px] uppercase tracking-[0.24em] text-[rgb(214_219_225/.35)] sm:block">← → to navigate</span>
          {!last ? (
            <button type="button" onClick={() => setI((n) => n + 1)} className={buttonClass("primary", "md", "min-w-[140px] uppercase tracking-[0.14em]")}>
              Next →
            </button>
          ) : side === "player" ? (
            <button
              type="button"
              onClick={() => {
                close();
                onStart?.();
              }}
              className={buttonClass("primary", "md", "yv-glow min-w-[160px] uppercase tracking-[0.14em]")}
            >
              Start exploring
            </button>
          ) : (
            <Link href="/host" onClick={markTutorialSeen} className={buttonClass("primary", "md", "yv-glow min-w-[160px] uppercase tracking-[0.14em]")}>
              Host a mission
            </Link>
          )}
        </div>
      </div>
      <style>{`
        @keyframes yv-tut-in { from { opacity: 0; transform: translateY(10px) scale(.98) } to { opacity: 1; transform: none } }
        .yv-tut { animation: yv-tut-in 320ms cubic-bezier(.2,.8,.2,1) both }
        @keyframes yv-tut-row-in { from { opacity: 0; transform: translateX(-8px) } to { opacity: 1; transform: none } }
        .yv-tut-row { animation: yv-tut-row-in 360ms ease-out both }
        @keyframes yv-tut-icon-in { 0% { opacity: 0; transform: scale(.6) rotate(-8deg) } 70% { opacity: 1; transform: scale(1.06) } 100% { transform: none } }
        .yv-tut-icon { animation: yv-tut-icon-in 520ms cubic-bezier(.2,.8,.2,1) both, yv-tut-float 4s ease-in-out 600ms infinite }
        @keyframes yv-tut-float { 50% { transform: translateY(-6px) } }
        @keyframes yv-tut-rot { to { transform: rotate(360deg) } }
        .yv-tut-spin { animation: yv-tut-rot 24s linear infinite }
        @media (prefers-reduced-motion: reduce) { .yv-tut, .yv-tut-row, .yv-tut-icon, .yv-tut-spin { animation: none } }
      `}</style>
    </div>
  );
}
