"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { WorldBuildingData } from "@/world/types";
import { districtName } from "@/components/world/shared";
import { buttonClass } from "@/components/ui";
import { CATEGORY_LABEL, SpaceLogo } from "./DiscoverPanel";
import { IconClose, IconFlag, IconStar } from "./icons";
import { KIND_COLOR } from "./MarkerLayer";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" }) : "");

/** Compact preview of a selected Space: what a visitor can actually do there. */
export function SpaceCard({ b, onClose, className = "" }: { b: WorldBuildingData; onClose(): void; className?: string }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus({ preventScroll: true }), [b.spaceId]);
  const f = b.featured;
  const color = f ? (f.template === "treasure_hunt" ? KIND_COLOR.hunt : KIND_COLOR.contest) : "#7C8AA0";
  const Kind = f?.template === "treasure_hunt" ? IconFlag : IconStar;
  return (
    <aside aria-label={`${b.name} preview`} className={`yv-enter rounded-[16px] border border-line bg-[#0e131bf2] shadow-pop backdrop-blur ${className}`}>
      <div className="flex items-start gap-3 p-4">
        <SpaceLogo b={b} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">
            {CATEGORY_LABEL[b.category] ?? b.category} · {districtName(b.districtId)}
          </p>
          <h2 className="truncate text-[19px] font-semibold">{b.name}</h2>
          {b.tagline && <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{b.tagline}</p>}
        </div>
        <button ref={close} type="button" onClick={onClose} aria-label="Close preview" className="grid size-8 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-paper-2 hover:text-ink">
          <IconClose size={16} />
        </button>
      </div>

      {f ? (
        <Link href={`/s/${b.slug}/c/${f.slug}`} className="mx-4 block rounded-[12px] border p-3 transition-colors hover:bg-paper-2/60" style={{ borderColor: `${color}55` }}>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color }}>
            <Kind size={12} /> {f.template === "treasure_hunt" ? "Treasure Hunt" : "Creative Contest"} · {f.status === "LIVE" ? `Live${f.endsAt ? ` until ${fmt(f.endsAt)}` : ""}` : `Starts ${fmt(f.startsAt)}`}
          </p>
          <p className="mt-1 font-semibold">{f.title}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">{f.rewards === "token" ? "Qualify for token rewards set by the organizer" : "Just for exploring — no token rewards"}</p>
        </Link>
      ) : (
        <p className="mx-4 rounded-[12px] border border-dashed border-line-strong p-3 text-[13px] text-ink-3">No experiences are open here right now.</p>
      )}

      <div className="flex items-center gap-2 p-4">
        <Link href={`/s/${b.slug}`} className={buttonClass("primary", "md", "flex-1")}>
          Explore Space
        </Link>
        <Link href={`/s/${b.slug}#experiences`} className={buttonClass("dark", "md")}>
          View Experiences{b.liveCampaigns + b.upcomingCampaigns > 0 ? ` (${b.liveCampaigns + b.upcomingCampaigns})` : ""}
        </Link>
      </div>
    </aside>
  );
}
