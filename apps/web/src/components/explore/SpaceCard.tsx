"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { WorldBuildingData } from "@/world/types";
import { frame, plate } from "./frame";
import { LiveReward, formatRate, rewardRate } from "./LiveReward";
import { IconClose } from "./icons";

const INK = "rgb(214 219 225";
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" }) : "");

/** Selected project: its mission, the treasure, and one big "start" action that opens the mission over the map. */
export function SpaceCard({ b, onClose, onPlay, className = "" }: { b: WorldBuildingData; onClose(): void; onPlay(slug: string, campaign: string): void; className?: string }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus({ preventScroll: true }), [b.spaceId]);
  const f = b.featured;
  const hunt = f?.template === "treasure_hunt";
  const prize = b.topPrize ?? f?.prize ?? null;
  const rate = prize ? rewardRate(prize).perDay : null;
  return (
    <aside aria-label={b.name} className={`yv-pop overflow-hidden bg-[rgb(5_7_10/.88)] font-mono backdrop-blur-xl ${className}`} style={frame(14, `${INK} / .16)`)}>
      <div className="flex items-stretch">
        <span className="relative w-[64px] shrink-0 overflow-hidden border-r border-[rgb(255_255_255/.08)] bg-[rgb(255_255_255/.04)]">
          {b.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logoUrl} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center font-display text-[24px] font-bold text-orange">{b.name[0]?.toUpperCase()}</span>
          )}
        </span>
        <div className="min-w-0 flex-1 px-4 py-3">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.5)]">{b.name}</p>
          <h2 className="mt-0.5 truncate font-display text-[17px] font-bold uppercase tracking-[0.02em] text-white">{f?.title ?? b.tagline ?? "Project"}</h2>
          {f && (
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-orange">
              {hunt ? "Treasure hunt" : "Creative challenge"}
              <span className="text-[rgb(214_219_225/.45)]"> · {f.status === "LIVE" ? (f.endsAt ? `ends ${fmt(f.endsAt)}` : "open now") : `starts ${fmt(f.startsAt)}`}</span>
            </p>
          )}
        </div>
        <button ref={close} type="button" onClick={onClose} aria-label="Close" className="grid w-10 shrink-0 place-items-center text-[rgb(214_219_225/.5)] hover:text-white">
          <IconClose size={15} />
        </button>
      </div>

      {f ? (
        <>
          {prize && (
            <div className="mx-3 mt-1 flex items-end justify-between gap-3 border-t border-dashed border-[rgb(255_194_75/.3)] px-1 pt-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-reward">Treasure · up to</p>
                <LiveReward prize={prize} className="font-display text-[24px] font-bold leading-tight text-reward" tailClassName="text-[14px] opacity-50" />
              </div>
              <span className="pb-1 text-[10.5px] font-bold text-mint-ink">{rate !== null ? formatRate(rate, prize.symbol) : ""}</span>
            </div>
          )}
          <div className="flex items-center gap-2 p-3">
            <button
              type="button"
              onClick={() => onPlay(b.slug, f.slug)}
              className="group flex h-12 flex-1 items-center justify-center gap-2 bg-[linear-gradient(180deg,#ffa458,#ff8a2a)] text-[12.5px] font-black uppercase tracking-[0.16em] text-[#140c05] shadow-[0_0_20px_rgb(255_145_56/.35)] transition-shadow hover:shadow-[0_0_30px_rgb(255_145_56/.6)]"
              style={plate(10)}
            >
              {f.status === "LIVE" ? (hunt ? "Start the hunt" : "Take the challenge") : "See the mission"}
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
            </button>
            <Link href={`/s/${b.slug}`} className="flex h-12 items-center px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[rgb(214_219_225/.7)] hover:text-white" style={frame(10, `${INK} / .2)`)}>
              Project
            </Link>
          </div>
        </>
      ) : (
        <p className="m-3 border border-dashed border-[rgb(214_219_225/.2)] p-4 text-[11.5px] uppercase tracking-[0.12em] text-[rgb(214_219_225/.5)]">No mission open here right now.</p>
      )}
    </aside>
  );
}
