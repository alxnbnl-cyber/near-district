"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DISTRICTS } from "@yielvy/core/world";
import type { WorldBuildingData, WorldData } from "@/world/types";
import type { WorldScene } from "@/world/scene";
import { Badge, buttonClass } from "@/components/ui";
import { FlagBadges, districtName, DISTRICT_TONE } from "./shared";

type Filter = "all" | "live" | "treasure_hunt" | "creative_contest";
const GLYPH_TONE: Record<string, string> = {
  orange: "bg-orange-wash text-orange-ink",
  violet: "bg-violet-wash text-violet-ink",
  mint: "bg-mint-wash text-mint-ink",
  sky: "bg-sky-wash text-sky-ink",
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "live", label: "Live now" },
  { id: "treasure_hunt", label: "Treasure hunts" },
  { id: "creative_contest", label: "Creative contests" },
];

export function WorldExplorer({ data }: { data: WorldData }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<WorldScene | null>(null);
  const router = useRouter();
  const params = useSearchParams();
  const perf = params.get("perf") === "1";
  const [mode, setMode] = useState<"map" | "list">("map");
  const [failed, setFailed] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [stats, setStats] = useState<{ fps: number; buildings: number; visibleObjects: number; drawMs: number } | null>(null);

  const byId = useMemo(() => new Map(data.buildings.map((b) => [b.spaceId, b])), [data]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.buildings.filter((b) => {
      if (filter === "live" && !b.flags.includes("live")) return false;
      if ((filter === "treasure_hunt" || filter === "creative_contest") && !b.templates.includes(filter)) return false;
      if (!q) return true;
      return b.name.toLowerCase().includes(q) || b.tagline.toLowerCase().includes(q) || b.category.includes(q);
    });
  }, [data, query, filter]);
  const filtering = query.trim() !== "" || filter !== "all";

  // Small screens start in the list; the map stays one tap away.
  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) setMode("list");
  }, []);

  useEffect(() => {
    if (mode !== "map" || !host.current) return;
    let cancelled = false;
    const el = host.current;
    (async () => {
      try {
        const probe = document.createElement("canvas");
        if (!probe.getContext("webgl2") && !probe.getContext("webgl")) throw new Error("WebGL is not available in this browser.");
        await document.fonts.ready;
        const { WorldScene } = await import("@/world/scene");
        const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
        const lowPower = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 || Boolean(nav.connection?.saveData);
        const fontFamily = getComputedStyle(document.documentElement).getPropertyValue("--font-outfit").trim() || "sans-serif";
        const s = await WorldScene.create(
          el,
          data,
          {
            onHover: (id) => setHovered(id),
            onSelect: (id) => setSelected(id),
            onOpenPlot: () => router.push("/host"),
            onStats: perf ? setStats : undefined,
          },
          { reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches, lowPower, fontFamily },
        );
        if (cancelled) return s.destroy();
        // Desktop panel is 360px wide on the right: keep focused buildings left of it.
        s.focusOffsetX = window.matchMedia("(min-width: 768px)").matches ? 190 : 0;
        scene.current = s;
        setReady(true);
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "The map could not start.");
        setMode("list");
      }
    })();
    return () => {
      cancelled = true;
      scene.current?.destroy();
      scene.current = null;
      setReady(false);
    };
    // data identity changes only on navigation
  }, [mode, data, perf, router]);

  useEffect(() => {
    scene.current?.setFilter(filtering ? new Set(matches.map((m) => m.spaceId)) : null);
  }, [matches, filtering, ready]);

  useEffect(() => {
    scene.current?.select(selected);
  }, [selected, ready]);

  const focusSpace = useCallback((id: string) => {
    setSelected(id);
    scene.current?.flyToSpace(id);
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    const s = scene.current;
    if (!s) return;
    const step = 80;
    const map: Record<string, () => void> = {
      ArrowLeft: () => s.panBy(step, 0),
      ArrowRight: () => s.panBy(-step, 0),
      ArrowUp: () => s.panBy(0, step),
      ArrowDown: () => s.panBy(0, -step),
      "+": () => s.zoomBy(1.2),
      "=": () => s.zoomBy(1.2),
      "-": () => s.zoomBy(1 / 1.2),
      Home: () => s.flyHome(),
      Escape: () => setSelected(null),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  const sel = selected ? byId.get(selected) : undefined;
  const hov = hovered && hovered !== selected ? byId.get(hovered) : undefined;
  const empty = data.buildings.length === 0;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-paper">
      {mode === "map" && (
        <div
          ref={host}
          tabIndex={0}
          role="application"
          aria-roledescription="interactive map"
          aria-label="Yielvy town map. Use arrow keys to pan, plus and minus to zoom, Home to return to the square. Use the search box or list view to open a Space."
          onKeyDown={onKey}
          className="absolute inset-0 outline-none"
        />
      )}

      {mode === "map" && !ready && !failed && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="rounded-full bg-card px-4 py-2 text-sm text-ink-2 shadow-lift">Unfolding the map…</p>
        </div>
      )}

      {/* Explore bar */}
      <div className="absolute left-3 top-[86px] z-20 w-[min(360px,calc(100%-24px))] md:top-[88px] md:left-5">
        <div className="rounded-[18px] border border-line bg-paper/95 p-3 shadow-lift backdrop-blur">
          <label htmlFor="world-search" className="sr-only">
            Search Spaces
          </label>
          <div className="relative">
            <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3">
              <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M14 14l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              id="world-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a project, community or hunt"
              className="h-10 w-full rounded-[12px] border border-line-strong bg-card pl-9 pr-3 text-sm placeholder:text-ink-3 focus:border-orange-deep focus:outline-none focus:ring-3 focus:ring-orange/25"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Filter by activity">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`h-7 rounded-full px-2.5 text-[12.5px] font-medium transition-colors ${
                  filter === f.id ? "bg-ink text-paper" : "bg-paper-2 text-ink-2 hover:text-ink"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {filtering && mode === "map" && (
            <ul className="mt-2 max-h-64 overflow-y-auto border-t border-line pt-2" aria-label="Matching Spaces">
              {matches.length === 0 && <li className="px-2 py-3 text-sm text-ink-3">Nothing matches yet.</li>}
              {matches.map((m) => (
                <li key={m.spaceId}>
                  <button type="button" onClick={() => focusSpace(m.spaceId)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-paper-2">
                    <SpaceGlyph b={m} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{m.name}</span>
                      <span className="block truncate text-[12px] text-ink-3">{districtName(m.districtId)}</span>
                    </span>
                    {m.flags.includes("live") && <Badge tone="orange" dot>Live</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Hover card */}
      {mode === "map" && hov && (
        <div className="yv-enter pointer-events-none absolute bottom-24 left-3 z-20 max-w-xs rounded-lg border border-line bg-card px-4 py-3 shadow-pop md:bottom-6 md:left-5">
          <p className="font-display text-[15px] font-semibold">{hov.name}</p>
          {hov.tagline && <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{hov.tagline}</p>}
          <p className="mt-1.5 text-[12px] text-ink-3">Click to look inside</p>
        </div>
      )}

      {/* Selected Space panel */}
      {sel && (
        <SpacePanel b={sel} onClose={() => setSelected(null)} />
      )}

      {/* Empty world */}
      {empty && (
        <div className="absolute inset-x-3 bottom-24 z-20 mx-auto max-w-md rounded-[18px] border border-line bg-paper/95 p-5 text-center shadow-pop backdrop-blur md:bottom-8">
          <h2 className="text-lg font-semibold">The town is still being built</h2>
          <p className="mt-1 text-sm text-ink-2">
            No Spaces have opened yet. The dashed plots are waiting for the first projects and communities to move in.
          </p>
          <Link href="/host" className={buttonClass("primary", "md", "mt-4")}>
            Claim the first plot
          </Link>
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-6 right-3 z-20 flex flex-col items-end gap-2 md:right-5">
        <div className="flex overflow-hidden rounded-[14px] border border-line bg-paper/95 shadow-lift" role="group" aria-label="View">
          {(["map", "list"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setFailed(null);
                setMode(m);
              }}
              className={`h-10 px-4 text-[13px] font-semibold ${mode === m ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2"}`}
            >
              {m === "map" ? "Map" : "List"}
            </button>
          ))}
        </div>
        {mode === "map" && ready && (
          <div className="flex flex-col overflow-hidden rounded-[14px] border border-line bg-paper/95 shadow-lift">
            <IconButton label="Zoom in" onClick={() => scene.current?.zoomBy(1.25)}>+</IconButton>
            <IconButton label="Zoom out" onClick={() => scene.current?.zoomBy(0.8)}>−</IconButton>
            <IconButton label="Back to the square" onClick={() => scene.current?.flyHome()}>⌂</IconButton>
          </div>
        )}
      </div>

      {mode === "list" && (
        <ListView buildings={filtering ? matches : data.buildings} failed={failed} onPick={(id) => router.push(`/s/${byId.get(id)!.slug}`)} />
      )}

      {perf && stats && (
        <div className="absolute right-3 top-[86px] z-30 rounded-md bg-night px-3 py-2 font-mono text-[11px] text-paper">
          {stats.fps} fps · frame logic {stats.drawMs}ms · {stats.buildings} buildings · {stats.visibleObjects} objects on screen
        </div>
      )}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-10 place-items-center text-lg font-semibold text-ink-2 hover:bg-paper-2 hover:text-ink">
      {children}
    </button>
  );
}

function SpaceGlyph({ b, size = 36 }: { b: WorldBuildingData; size?: number }) {
  const tone = DISTRICT_TONE[b.districtId] ?? "orange";
  return b.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={b.logoUrl} alt="" width={size} height={size} className="shrink-0 rounded-[10px] border border-line object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-[10px] font-display font-bold ${GLYPH_TONE[tone]}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {b.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function SpacePanel({ b, onClose }: { b: WorldBuildingData; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), [b.spaceId]);
  return (
    <aside
      aria-label={`${b.name} preview`}
      className="yv-enter absolute inset-x-3 bottom-3 z-30 rounded-[20px] border border-line bg-card p-5 shadow-pop md:inset-x-auto md:bottom-auto md:right-5 md:top-[88px] md:w-[360px]"
    >
      <div className="flex items-start gap-3">
        <SpaceGlyph b={b} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">{districtName(b.districtId)}</p>
          <h2 className="truncate text-xl font-semibold">{b.name}</h2>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close preview" className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-paper-2 hover:text-ink">
          ✕
        </button>
      </div>
      {b.tagline && <p className="mt-3 text-sm text-ink-2">{b.tagline}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <FlagBadges flags={b.flags} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-paper px-4 py-3 text-sm">
        <div>
          <dt className="text-[12px] text-ink-3">Happening now</dt>
          <dd className="font-display text-lg font-semibold tabular">{b.liveCampaigns}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-ink-3">Coming up</dt>
          <dd className="font-display text-lg font-semibold tabular">{b.upcomingCampaigns}</dd>
        </div>
      </dl>
      <Link href={`/s/${b.slug}`} className={buttonClass("primary", "lg", "mt-4 w-full")}>
        Enter {b.name}
      </Link>
    </aside>
  );
}

function ListView({ buildings, failed, onPick }: { buildings: WorldBuildingData[]; failed: string | null; onPick: (id: string) => void }) {
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-paper pb-28 pt-[250px] md:pt-[88px]">
      <div className="mx-auto max-w-3xl px-4 md:pl-[400px] md:max-w-none md:pr-8">
        {failed && (
          <p className="mb-4 rounded-md bg-gold-wash px-4 py-3 text-sm text-gold-ink">
            The interactive map isn't available here ({failed}). Everything is listed below instead.
          </p>
        )}
        {DISTRICTS.map((d) => {
          const items = buildings.filter((b) => b.districtId === d.id);
          return (
            <section key={d.id} className="mb-8" aria-labelledby={`d-${d.id}`}>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 id={`d-${d.id}`} className="text-lg font-semibold">
                  {d.name}
                </h2>
                <p className="text-[13px] text-ink-3">{d.tagline}</p>
              </div>
              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-sm text-ink-3">
                  No Spaces here yet. <Link className="font-semibold text-orange-ink underline-offset-2 hover:underline" href="/host">Open one</Link>
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {items.map((b) => (
                    <li key={b.spaceId}>
                      <button
                        type="button"
                        onClick={() => onPick(b.spaceId)}
                        className="flex w-full items-center gap-3 rounded-lg border border-line bg-card p-3 text-left shadow-lift hover:border-line-strong"
                      >
                        <SpaceGlyph b={b} size={44} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{b.name}</span>
                          <span className="block truncate text-[13px] text-ink-2">{b.tagline || " "}</span>
                          <span className="mt-1 flex gap-1">
                            <FlagBadges flags={b.flags} />
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
