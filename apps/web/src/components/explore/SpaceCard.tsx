"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { WorldBuildingData } from "@/world/types";
import { buttonClass } from "@/components/ui";
import { SpaceLogo } from "./DiscoverPanel";
import { IconClose, IconFlag, IconStar } from "./icons";
import { PrizeChip } from "./PrizeChip";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" }) : "");

/** Selected vault: the prize first, then the quest and one clear action. */
export function SpaceCard({ b, onClose, className = "" }: { b: WorldBuildingData; onClose(): void; className?: string }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus({ preventScroll: true }), [b.spaceId]);
  const f = b.featured;
  const hunt = f?.template === "treasure_hunt";
  const Kind = hunt ? IconFlag : IconStar;
  return (
    <aside aria-label={`${b.name}`} className={`yv-pop overflow-hidden rounded-[18px] border border-line bg-[#0e131bf2] shadow-pop backdrop-blur ${className}`}>
      <div className="flex items-center gap-3 px-4 pt-4">
        <SpaceLogo b={b} size={46} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[18px] font-semibold">{b.name}</h2>
          {b.tagline && <p className="truncate text-[12.5px] text-ink-3">{b.tagline}</p>}
        </div>
        <button ref={close} type="button" onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-paper-2 hover:text-ink">
          <IconClose size={16} />
        </button>
      </div>

      {f ? (
        <Link href={`/s/${b.slug}/c/${f.slug}`} className="card-reward mx-4 mt-3 block rounded-[14px] p-4 transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between gap-2">
            <p className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] ${hunt ? "text-sky" : "text-violet-ink"}`}>
              <Kind size={12} /> {hunt ? "Treasure Hunt" : "Creative Challenge"}
            </p>
            <span className="text-[11.5px] text-ink-3">{f.status === "LIVE" ? (f.endsAt ? `Ends ${fmt(f.endsAt)}` : "Live") : `Starts ${fmt(f.startsAt)}`}</span>
          </div>
          <p className="mt-1.5 text-[17px] font-semibold leading-snug">{f.title}</p>
          <div className="mt-3">
            <PrizeChip prize={f.prize} rewards={f.rewards} size="lg" />
          </div>
        </Link>
      ) : (
        <p className="mx-4 mt-3 rounded-[14px] border border-dashed border-line-strong p-4 text-[13px] text-ink-3">No quest open here right now. Check back soon.</p>
      )}

      <div className="flex items-center gap-2 p-4">
        {f ? (
          <Link href={`/s/${b.slug}/c/${f.slug}`} className={buttonClass("primary", "md", "flex-1")}>
            {f.status === "LIVE" ? (hunt ? "Start the hunt" : "Take the challenge") : "See the quest"}
          </Link>
        ) : null}
        <Link href={`/s/${b.slug}`} className={buttonClass("dark", "md", f ? "" : "flex-1")}>
          Visit vault
        </Link>
      </div>
    </aside>
  );
}
