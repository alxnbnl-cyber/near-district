"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { buttonClass } from "@/components/ui";
import { IconCompass, IconFlag, IconSparkle } from "./icons";

const STEPS = [
  { icon: IconCompass, title: "Explore", body: "Discover interesting projects and communities.", color: "#FF9138" },
  { icon: IconFlag, title: "Play", body: "Complete treasure hunts and creative challenges.", color: "#32C8EF" },
  { icon: IconSparkle, title: "Get Rewarded", body: "Qualify for rewards from participating projects.", color: "#9B87F5" },
];

/** First-visit scene: one screen, a few seconds to understand Yielvy, the world visible behind it. */
export function WelcomeOverlay({ leaving, onEnter }: { leaving: boolean; onEnter(): void }) {
  const cta = useRef<HTMLButtonElement>(null);
  useEffect(() => cta.current?.focus({ preventScroll: true }), []);
  return (
    <section
      aria-labelledby="welcome-title"
      className={`absolute inset-0 z-40 flex items-center transition-[opacity,transform] duration-[380ms] ease-out ${leaving ? "pointer-events-none -translate-x-6 opacity-0" : "opacity-100"}`}
    >
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgb(9_11_16/0.96)_0%,rgb(9_11_16/0.82)_38%,rgb(9_11_16/0.25)_70%,rgb(9_11_16/0.45)_100%)]" />
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_50%,transparent_30%,rgb(9_11_16/0.7)_100%)]" />
      <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="max-w-xl yv-enter">
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-orange">Welcome to Yielvy</p>
          <h1 id="welcome-title" className="mt-4 text-[40px] font-semibold leading-[1.05] sm:text-[58px]">
            There&apos;s a world worth exploring.
          </h1>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">
            Discover projects, take on challenges, and uncover real rewards — all in one interactive world.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button ref={cta} type="button" onClick={onEnter} className={buttonClass("primary", "lg", "px-7")}>
              Enter the World
            </button>
            <Link href="/host" className={buttonClass("dark", "lg")}>
              Host a Space
            </Link>
          </div>
          <ol className="mt-12 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-l-2 pl-3" style={{ borderColor: `${s.color}99` }}>
                <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                  <s.icon size={15} className="shrink-0" />
                  <span>
                    {i + 1}. {s.title}
                  </span>
                </p>
                <p className="mt-1 text-[12.5px] leading-snug text-ink-3">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
