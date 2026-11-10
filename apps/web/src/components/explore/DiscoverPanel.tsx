"use client";

import Link from "next/link";
import { forwardRef } from "react";
import type { WorldBuildingData } from "@/world/types";
import { IconChevron, IconSearch } from "./icons";
import { KIND_COLOR } from "./MarkerLayer";
import { PrizeChip } from "./PrizeChip";

export type Filter = "all" | "live" | "treasure_hunt" | "creative_contest";
export const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
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
  onAbout(): void;
}

/** Explore tab: every quest on the map, live prizes first. */
export const DiscoverPanel = forwardRef<HTMLInputElement, Props>(function DiscoverPanel(
  { results, total, query, filter, selectedId, onQuery, onFilter, onPick, onAbout, showSearch = true },
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
              className={`h-7 rounded-full border px-3 text-[12.5px] font-semibold transition-colors ${
                filter === f.id ? "border-orange bg-orange-wash text-orange-ink" : "border-line-strong text-ink-2 hover:border-ink-3 hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 px-4 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        {query || filter !== "all" ? `${results.length} of ${total} projects` : `${total} project${total === 1 ? "" : "s"}`}
      </p>
      <ul className="yv-stagger mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3" aria-label="Projects">
        {results.length === 0 && (
          <li className="px-2 py-6 text-center text-[13px] text-ink-3">{total === 0 ? "No missions are open yet." : "Nothing matches that search."}</li>
        )}
        {results.map((b) => (
          <li key={b.spaceId}>
            <VaultRow b={b} selected={b.spaceId === selectedId} onPick={onPick} />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[12.5px]">
        <button type="button" onClick={onAbout} className="font-medium text-ink-3 hover:text-ink">
          How it works
        </button>
        <Link href="/organizer" className="font-semibold text-orange-ink hover:underline">
          Host a mission →
        </Link>
      </div>
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
      className={`group flex w-full items-center gap-3 rounded-[14px] border p-3 text-left transition-all hover:-translate-y-px ${
        selected ? "border-orange/70 bg-[linear-gradient(100deg,rgb(255_145_56/0.26),rgb(255_145_56/0.05))]" : "border-line bg-[#0b0e13] hover:border-line-strong"
      }`}
    >
      <SpaceLogo b={b} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{b.name}</span>
        <span className="block truncate text-[12.5px] text-ink-3">{b.featured?.title ?? b.tagline ?? CATEGORY_LABEL[b.category]}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {live && b.featured ? (
            <>
              <PrizeChip prize={b.topPrize} rewards={b.featured.rewards} />
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-ink">
                <span className="size-1.5 animate-pulse rounded-full bg-orange" /> Live
              </span>
            </>
          ) : b.upcomingCampaigns > 0 ? (
            <span className="rounded-full bg-sky-wash px-2 py-0.5 text-[11px] font-semibold text-sky-ink">Opening soon</span>
          ) : (
            <span className="text-[11px] text-ink-3">No mission right now</span>
          )}
        </span>
      </span>
      <IconChevron size={16} className="text-ink-3 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

export { CATEGORY_LABEL };
