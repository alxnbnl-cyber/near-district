"use client";

import Link from "next/link";
import { forwardRef } from "react";
import type { WorldBuildingData } from "@/world/types";
import { IconChevron, IconSearch } from "./icons";
import { KIND_COLOR } from "./MarkerLayer";
import { PrizeChip } from "./PrizeChip";
import { frame, plate } from "./GameHud";

export type Filter = "all" | "live" | "treasure_hunt" | "creative_contest";
export const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "treasure_hunt", label: "Missions" },
  { id: "creative_contest", label: "Challenges" },
];

const CATEGORY_LABEL: Record<string, string> = {
  project: "Project", defi: "DeFi", infrastructure: "Infrastructure", tooling: "Developer tools", other: "Project",
  puzzle: "Puzzles", gaming: "Gaming", creative: "Creative studio", art: "Art", media: "Media",
  community: "Community", dao: "DAO", education: "Education", social: "Social",
};

interface Props {
  results: WorldBuildingData[];
  total: number;
  query: string;
  filter: Filter;
  selectedId: string | null;
  onQuery(q: string): void;
  onFilter(f: Filter): void;
  onPick(id: string): void;
  onCollapse?(): void;
  /** Hide the in-panel search when a search box lives elsewhere. */
  showSearch?: boolean;
  /** Hide the "How it works / Host a mission" footer (the game HUD has its own). */
  hideFooter?: boolean;
  onAbout(): void;
}

/** Explore tab: every quest on the map, live prizes first. */
export const DiscoverPanel = forwardRef<HTMLInputElement, Props>(function DiscoverPanel(
  { results, total, query, filter, selectedId, onQuery, onFilter, onPick, onAbout, showSearch = true, hideFooter = false },
  searchRef,
) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-4 pt-4">
        {showSearch && (
          <div className="relative mb-3">
            <label htmlFor="discover-search" className="sr-only">Search missions and projects</label>
            <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              ref={searchRef}
              id="discover-search"
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search missions & projects"
              className="h-10 w-full rounded-[12px] border border-line-strong bg-paper pl-9 pr-3 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/25"
            />
          </div>
        )}
        <div className="flex gap-1.5" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => onFilter(f.id)}
              className={`h-7 border px-3 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] transition-colors ${
                filter === f.id ? "border-orange bg-orange/15 text-orange" : "border-[rgb(214_219_225/.18)] text-[rgb(214_219_225/.6)] hover:border-[rgb(214_219_225/.4)] hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 px-4 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[rgb(214_219_225/.45)]">
        {query || filter !== "all" ? `${results.length} of ${total} projects` : `${total} project${total === 1 ? "" : "s"}`}
      </p>
      <ul className="yv-stagger mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-28" aria-label="Projects">
        {results.length === 0 && (
          <li className="px-2 py-6 text-center text-[13px] text-ink-3">{total === 0 ? "No missions are open yet." : "Nothing matches that search."}</li>
        )}
        {results.map((b) => (
          <li key={b.spaceId}>
            <VaultRow b={b} selected={b.spaceId === selectedId} onPick={onPick} />
          </li>
        ))}
      </ul>
      {!hideFooter && (
      <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[12.5px]">
        <button type="button" onClick={onAbout} className="font-medium text-ink-3 hover:text-ink">
          How it works
        </button>
        <Link href="/organizer" className="font-semibold text-orange-ink hover:underline">
          Host a mission →
        </Link>
      </div>
      )}
    </div>
  );
});

export function SpaceLogo({ b, size = 44 }: { b: WorldBuildingData; size?: number }) {
  const color = b.liveCampaigns ? KIND_COLOR[b.kind] : "#7C8AA0";
  return b.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={b.logoUrl} alt="" className="shrink-0 rounded-[12px] border border-line object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-[12px] border border-line-strong bg-paper font-display font-bold" style={{ width: size, height: size, color, fontSize: size * 0.42 }}>
      {(b.name.match(/[A-Za-z0-9]/)?.[0] ?? "Y").toUpperCase()}
    </span>
  );
}

function VaultRow({ b, selected, onPick }: { b: WorldBuildingData; selected: boolean; onPick(id: string): void }) {
  const live = b.liveCampaigns > 0;
  return (
    <button
      type="button"
      onClick={() => onPick(b.spaceId)}
      aria-current={selected}
      className={`group relative flex min-h-[104px] w-full items-stretch text-left transition-colors ${
        selected ? "" : "bg-[rgb(10_13_18/.5)] hover:bg-[rgb(22_28_38/.6)]"
      }`}
      style={{ ...plate(10), ...(selected ? { backgroundImage: "linear-gradient(100deg,rgb(255 145 56 / .24),rgb(255 145 56 / .04))" } : {}) }}
    >
      {/* outline drawn last so it sits over the logo */}
      <span aria-hidden className="pointer-events-none absolute inset-0 z-10" style={frame(10, selected ? "rgb(255 145 56 / .7)" : "rgb(214 219 225 / .14)")} />
      {/* logo fills the whole left side of the card */}
      <span className="relative grid w-[104px] shrink-0 place-items-center overflow-hidden border-r border-[rgb(255_255_255/.1)] bg-[rgb(255_255_255/.04)]">
        {b.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.logoUrl} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <span aria-hidden className="font-display text-[28px] font-bold text-[rgb(214_219_225/.7)]">{(b.name.match(/[A-Za-z0-9]/)?.[0] ?? "Y").toUpperCase()}</span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-4 py-3.5">
        <span className="block truncate font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[rgb(214_219_225/.5)]">{b.name}</span>
        <span className="block truncate text-[15.5px] font-semibold leading-tight text-white">{b.featured?.title ?? b.tagline ?? CATEGORY_LABEL[b.category]}</span>
        <span className="mt-2 flex items-center gap-1.5">
          {live && b.featured ? (
            <PrizeChip prize={b.topPrize} rewards={b.featured.rewards} />
          ) : b.upcomingCampaigns > 0 ? (
            <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-sky-ink">Opening soon</span>
          ) : (
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[rgb(214_219_225/.4)]">No mission right now</span>
          )}
        </span>
      </span>
      <IconChevron size={16} className="mr-3.5 shrink-0 self-center text-[rgb(214_219_225/.4)] transition-colors group-hover:text-orange" />
    </button>
  );
}

export { CATEGORY_LABEL };
