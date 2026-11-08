"use client";

import Link from "next/link";
import { forwardRef } from "react";
import type { WorldBuildingData } from "@/world/types";
import { districtName } from "@/components/world/shared";
import { IconChevron, IconCube, IconFlag, IconSearch, IconStar } from "./icons";
import { KIND_COLOR } from "./MarkerLayer";

export type Filter = "all" | "live" | "treasure_hunt" | "creative_contest";
export const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live now" },
  { id: "treasure_hunt", label: "Treasure Hunts" },
  { id: "creative_contest", label: "Creative Contests" },
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
  onAbout(): void;
}

export const DiscoverPanel = forwardRef<HTMLInputElement, Props>(function DiscoverPanel(
  { results, total, query, filter, selectedId, onQuery, onFilter, onPick, onCollapse, onAbout },
  searchRef,
) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="text-[19px] font-semibold">Discover Spaces</h2>
          <p className="text-[13px] text-ink-3">Find your next adventure.</p>
        </div>
        {onCollapse && (
          <button type="button" onClick={onCollapse} aria-label="Collapse panel" title="Collapse panel" className="grid size-8 place-items-center rounded-md text-ink-3 hover:bg-paper-2 hover:text-ink">
            <IconChevron dir="left" size={16} />
          </button>
        )}
      </div>
      <div className="px-5 pt-4">
        <label htmlFor="discover-search" className="sr-only">
          Search projects, challenges, or communities
        </label>
        <div className="relative">
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            ref={searchRef}
            id="discover-search"
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search projects, challenges, or communities…"
            className="h-10 w-full rounded-[10px] border border-line-strong bg-paper pl-9 pr-3 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/25"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => onFilter(f.id)}
              className={`h-7 rounded-full border px-3 text-[12.5px] font-medium transition-colors ${
                filter === f.id ? "border-orange bg-orange-wash text-orange-ink" : "border-line-strong text-ink-2 hover:border-ink-3 hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between px-5 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        <span>{query || filter !== "all" ? `${results.length} of ${total}` : `${total} Space${total === 1 ? "" : "s"}`}</span>
      </div>
      <ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3" aria-label="Spaces">
        {results.length === 0 && (
          <li className="px-2 py-6 text-center text-[13px] text-ink-3">{total === 0 ? "No Spaces have opened yet." : "Nothing matches that search."}</li>
        )}
        {results.map((b) => (
          <li key={b.spaceId}>
            <SpaceRow b={b} selected={b.spaceId === selectedId} onPick={onPick} />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[12.5px]">
        <button type="button" onClick={onAbout} className="font-medium text-ink-3 hover:text-ink">
          What is Yielvy?
        </button>
        <Link href="/host" className="font-semibold text-orange-ink hover:underline">
          Host a Space
        </Link>
      </div>
    </div>
  );
});

export function SpaceLogo({ b, size = 44 }: { b: WorldBuildingData; size?: number }) {
  const color = b.liveCampaigns ? KIND_COLOR[b.kind] : "#7C8AA0";
  return b.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={b.logoUrl} alt="" className="shrink-0 rounded-[10px] border border-line object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-[10px] border border-line-strong bg-paper font-display font-bold" style={{ width: size, height: size, color, fontSize: size * 0.42 }}>
      {b.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function SpaceRow({ b, selected, onPick }: { b: WorldBuildingData; selected: boolean; onPick(id: string): void }) {
  const Kind = b.kind === "hunt" ? IconFlag : b.kind === "contest" ? IconStar : IconCube;
  return (
    <button
      type="button"
      onClick={() => onPick(b.spaceId)}
      aria-current={selected}
      className={`group flex w-full items-center gap-3 rounded-[12px] border p-3 text-left transition-colors ${
        selected ? "border-orange/70 bg-orange-wash" : "border-line bg-paper/40 hover:border-line-strong hover:bg-paper-2/60"
      }`}
    >
      <SpaceLogo b={b} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{b.name}</span>
        <span className="block truncate text-[12.5px] text-ink-3">
          {CATEGORY_LABEL[b.category] ?? b.category} · {districtName(b.districtId)}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {b.liveCampaigns > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${KIND_COLOR[b.kind]}1f`, color: KIND_COLOR[b.kind] }}>
              <Kind size={11} /> {b.liveCampaigns} live
            </span>
          ) : b.upcomingCampaigns > 0 ? (
            <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2">{b.upcomingCampaigns} upcoming</span>
          ) : (
            <span className="text-[11px] text-ink-3">No live experiences</span>
          )}
          {b.flags.includes("new") && <span className="rounded-full border border-line-strong px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">New</span>}
        </span>
      </span>
      <IconChevron size={16} className="text-ink-3 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

export { CATEGORY_LABEL };
