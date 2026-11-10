"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateAtlas } from "@yielvy/core/world";
import type { AtlasScene } from "@/world/atlas-scene";
import type { WorldData } from "@/world/types";
import { buttonClass } from "@/components/ui";
import { Logo } from "@/components/brand/Logo";
import { UserMenu } from "@/components/shell/UserMenu";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { MarkerLayer } from "./MarkerLayer";
import { StatusBar, ZoomSlider } from "./GameHud";
import { DiscoverPanel, type Filter } from "./DiscoverPanel";
import { AdventuresTab, ExperiencesTab } from "./PanelTabs";
import { SpaceCard } from "./SpaceCard";
import { ExpeditionCard } from "./ExpeditionCard";
import { MapHud } from "./MapHud";
import { WelcomeOverlay } from "./WelcomeOverlay";
import { IconCompass, IconFlag, IconMap, IconSearch } from "./icons";

const PANEL_W = 380;

export type Tab = "discover" | "experiences" | "adventures";
const TABS: { id: Tab; label: string; icon: typeof IconCompass }[] = [
  { id: "discover", label: "Explore", icon: IconCompass },
  { id: "experiences", label: "Missions", icon: IconFlag },
  { id: "adventures", label: "Me", icon: IconMap },
];


type Mode = "pending" | "welcome" | "explore";
export interface Viewer {
  displayName: string;
  isAdmin: boolean;
}

/** The whole map experience: top bar, full-bleed city map, list panel on the right. */
export function WorldExperience({ data, initialMode, viewer }: { data: WorldData; initialMode: "welcome" | "explore"; viewer: Viewer | null }) {
  const atlas = useMemo(() => generateAtlas(), []);
  const host = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [scene, setScene] = useState<AtlasScene | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode === "explore" ? "explore" : "pending");
  const [leaving, setLeaving] = useState(false);
  const [tab, setTab] = useState<Tab>("discover");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeId, setRouteId] = useState<string | null>(null);
  /** Where "Explore Partner Space" came from; only our own mission pages are accepted. */
  const [back, setBack] = useState<string | null>(null);
  const deepLinked = useRef<{ space?: string; expedition?: string }>({});

  // Opening view: a random live Space (or any Space), never a fixed centre.
  const startSpace = useMemo(() => {
    const live = data.buildings.filter((b) => b.liveCampaigns > 0);
    const pool = live.length ? live : data.buildings;
    return pool.length ? pool[Math.floor(Math.random() * pool.length)]! : null;
  }, [data]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setMobile(mq.matches);
    const onMq = () => setMobile(mq.matches);
    mq.addEventListener("change", onMq);
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "experiences" || t === "adventures" || t === "discover") {
      setTab(t);
      if (mq.matches) setSheetOpen(true);
    }
    const b = params.get("back");
    if (b && /^\/s\/[a-z0-9-]+\/c\/[a-z0-9-]+$/.test(b)) setBack(b);
    deepLinked.current = { space: params.get("space") ?? undefined, expedition: params.get("expedition") ?? undefined };
    if (initialMode === "welcome") {
      setMode("welcome"); // the welcome scene opens every visit to the home page
    }
    return () => mq.removeEventListener("change", onMq);
  }, [initialMode]);

  useEffect(() => {
    if (!host.current) return;
    let s: AtlasScene | null = null;
    let cancelled = false;
    (async () => {
      try {
        const probe = document.createElement("canvas");
        if (!probe.getContext("webgl2") && !probe.getContext("webgl")) throw new Error("WebGL is unavailable in this browser");
        const { AtlasScene } = await import("@/world/atlas-scene");
        const nav = navigator as Navigator & { deviceMemory?: number };
        s = await AtlasScene.create(host.current!, atlas, {
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          lowPower: (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4,
          interactive: initialMode === "explore",
        });
        if (cancelled) return s.destroy();
        s.start = startSpace ? [startSpace.x * atlas.width, startSpace.y * atlas.height] : [atlas.width * (0.25 + Math.random() * 0.4), atlas.height * (0.25 + Math.random() * 0.5)];
        s.home(false);
        setScene(s);
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "The map could not start");
      }
    })();
    return () => {
      cancelled = true;
      s?.destroy();
    };
  }, [atlas, initialMode, startSpace]);

  useEffect(() => {
    if (!scene) return;
    scene.setInteractive(mode === "explore");
    const w = host.current?.clientWidth ?? 1200;
    scene.focusPadding =
      mode === "welcome" ? { left: mobile ? 0 : w * 0.42, right: 0, bottom: 0 } : { left: 0, right: 0, bottom: mobile && selectedId ? 300 : 0 };
  }, [scene, mode, mobile, selectedId]);

  const route = routeId ? (data.routes.find((r) => r.id === routeId) ?? null) : null;
  const routeSpaces = useMemo(() => (route ? new Set(route.chapters.map((c) => c.spaceId)) : null), [route]);

  // Areas: every live Space normally; only the expedition's destinations while one is selected.
  useEffect(() => {
    if (mode !== "explore") return scene?.setAreas([], null); // keep the welcome scene clean
    scene?.setAreas(
      data.buildings
        .filter((b) => !routeSpaces || routeSpaces.has(b.spaceId))
        .map((b) => ({ id: b.spaceId, x: b.x * atlas.width, y: b.y * atlas.height, live: routeSpaces ? true : b.liveCampaigns > 0 })),
      selectedId,
    );
  }, [scene, data, atlas, selectedId, routeSpaces, mode]);

  // Routes are a navigation layer: drawn only for the selected, published expedition.
  useEffect(() => {
    if (!scene) return;
    if (!route) return scene.setRoutes([]);
    const pts = route.chapters
      .map((c) => data.buildings.find((b) => b.spaceId === c.spaceId))
      .filter(Boolean)
      .map((b) => [b!.x * atlas.width, b!.y * atlas.height] as [number, number]);
    let done = 0;
    while (done < route.chapters.length && route.chapters[done]!.completed) done++;
    scene.setRoutes(pts.length > 1 ? [{ id: route.id, points: pts, completedSegments: done }] : []);
  }, [scene, data, atlas, route]);

  const focusRoute = useCallback(
    (id: string) => {
      const r = data.routes.find((x) => x.id === id);
      if (!r) return;
      setRouteId(id);
      setSelectedId(null);
      setSheetOpen(false);
      const bs = r.chapters.map((c) => data.buildings.find((b) => b.spaceId === c.spaceId)).filter(Boolean);
      if (!scene || !bs.length) return;
      const xs = bs.map((b) => b!.x * atlas.width), ys = bs.map((b) => b!.y * atlas.height);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const el = host.current;
      const vw = el?.clientWidth ?? 1200, vh = el?.clientHeight ?? 800;
      const s = Math.max(0.12, Math.min(0.9, Math.min(vw / (x1 - x0 + 900), vh / (y1 - y0 + 900))));
      scene.flyTo((x0 + x1) / 2, (y0 + y1) / 2, s, 900);
    },
    [data, scene, atlas, mobile],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.buildings
      .filter((b) => {
        if (filter === "live" && b.liveCampaigns === 0) return false;
        if ((filter === "treasure_hunt" || filter === "creative_contest") && !b.templates.includes(filter)) return false;
        if (!q) return true;
        return [b.name, b.tagline, b.category, b.featured?.title ?? ""].some((s) => s.toLowerCase().includes(q));
      })
      .sort((a, b) => b.liveCampaigns - a.liveCampaigns || a.name.localeCompare(b.name));
  }, [data, query, filter]);
  const visibleIds = useMemo(() => (query.trim() || filter !== "all" ? new Set(results.map((r) => r.spaceId)) : null), [results, query, filter]);
  const selected = selectedId ? data.buildings.find((b) => b.spaceId === selectedId) ?? null : null;
  const stats = useMemo(
    () => ({
      spaces: data.buildings.length,
      live: data.experiences.filter((e) => e.status === "LIVE").length,
      hunts: data.experiences.filter((e) => e.status === "LIVE" && e.template === "treasure_hunt").length,
      contests: data.experiences.filter((e) => e.status === "LIVE" && e.template === "creative_contest").length,
    }),
    [data],
  );

  const select = useCallback(
    (id: string) => {
      const b = data.buildings.find((x) => x.spaceId === id);
      if (!b) return;
      setSelectedId(id);
      setSheetOpen(false);
      scene?.flyTo(b.x * atlas.width, b.y * atlas.height, Math.max(0.6, scene.camera().s));
    },
    [data, scene, atlas],
  );

  const enter = useCallback(() => {
    setLeaving(true);
    window.history.pushState(null, "", "/explore");
    setTimeout(() => {
      setMode("explore");
      setLeaving(false);
      scene?.home();
    }, 380);
  }, [scene]);

  // Deep links: ?space=<slug> (partner hints) and ?expedition=<slug>.
  useEffect(() => {
    if (!scene || mode !== "explore") return;
    const { space, expedition } = deepLinked.current;
    deepLinked.current = {};
    if (expedition) {
      const r = data.routes.find((x) => x.slug === expedition);
      if (r) focusRoute(r.id);
    }
    if (space) {
      const b = data.buildings.find((x) => x.slug === space);
      if (b) setTimeout(() => select(b.spaceId), expedition ? 950 : 0);
    }
  }, [scene, mode, data, focusRoute, select]);

  useEffect(() => {
    if (mode !== "explore") return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input,textarea,select");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setTab("discover");
        if (mobile) setSheetOpen(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      } else if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, mobile]);

  const onMapKey = (e: React.KeyboardEvent) => {
    if (!scene || mode !== "explore") return;
    const m: Record<string, () => void> = {
      ArrowLeft: () => scene.panBy(90, 0),
      ArrowRight: () => scene.panBy(-90, 0),
      ArrowUp: () => scene.panBy(0, 90),
      ArrowDown: () => scene.panBy(0, -90),
      "+": () => scene.zoomBy(1.3),
      "=": () => scene.zoomBy(1.3),
      "-": () => scene.zoomBy(1 / 1.3),
    };
    if (m[e.key]) {
      e.preventDefault();
      m[e.key]!();
    }
  };

  const exploring = mode === "explore";
  /** The map stops where the side panel begins (desktop); the panel never covers it. */
  const mapRight = exploring && !mobile ? PANEL_W : 0;
  const empty = data.buildings.length === 0;
  const openTab = (t: Tab) => {
    setTab(t);
    if (mobile) setSheetOpen(true);
  };

  const panelContent = (
    <>
      {tab === "discover" && (
        <DiscoverPanel
          ref={mobile ? searchRef : undefined}
          showSearch={mobile}
          results={results}
          total={data.buildings.length}
          query={query}
          filter={filter}
          selectedId={selectedId}
          onQuery={setQuery}
          onFilter={setFilter}
          onPick={select}
          onAbout={() => {
            setSelectedId(null);
            setMode("welcome");
            scene?.cinematic();
          }}
        />
      )}
      {tab === "experiences" && <ExperiencesTab items={data.experiences} routes={data.routes} selectedRouteId={routeId} onSelectRoute={focusRoute} onFocusSpace={select} />}
      {tab === "adventures" && <AdventuresTab signedIn={Boolean(viewer)} onFocusSpace={select} />}
    </>
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-paper">
      <div
        ref={host}
        tabIndex={exploring ? 0 : -1}
        role="application"
        aria-roledescription="map"
        aria-label="Yielvy map. Drag or use arrow keys to pan, scroll or plus and minus to zoom."
        onKeyDown={onMapKey}
        className={`absolute inset-y-0 left-0 outline-none transition-[opacity,right] duration-700 ${scene ? "opacity-100" : "opacity-0"}`}
        // tactical grade: grey map so the orange pins pop
        style={{ right: mapRight, filter: "grayscale(1) contrast(1.12) brightness(1.08)", transition: "filter 700ms" }}
      />
      {/* soft vignette: darkens the edges and corners so the map feels framed (never blocks input) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0"
        style={{
          right: mapRight,
          background:
            "radial-gradient(ellipse 75% 70% at 50% 50%, transparent 55%, rgb(5 7 11 / 0.55) 85%, rgb(5 7 11 / 0.85) 100%), linear-gradient(180deg, rgb(5 7 11 / 0.55), transparent 14%, transparent 86%, rgb(5 7 11 / 0.6))",
        }}
      />
      <MapHud
        scene={scene}
        right={mapRight}
        visible={exploring || mode === "welcome"}
        compact={!exploring}
        title="Explore map"
        subtitle={`${stats.spaces} project${stats.spaces === 1 ? "" : "s"} · ${stats.live} live mission${stats.live === 1 ? "" : "s"}`}
      />
      {failed && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-3">
          <p>The map couldn&apos;t start ({failed}).</p>
        </div>
      )}

      <div className={`pointer-events-none absolute inset-y-0 left-0 transition-opacity duration-500 ${exploring ? "opacity-100" : "opacity-0"}`} style={{ right: mapRight }}>
        <MarkerLayer
          atlas={atlas}
          scene={scene}
          buildings={data.buildings}
          visibleIds={visibleIds}
          selectedId={selectedId}
          interactive={exploring}
          onSelect={select}
          onZoomTo={(x, y, s) => scene?.flyTo(x, y, s)}
        />
      </div>

      {(mode === "welcome" || leaving) && <WelcomeOverlay scene={scene} buildings={data.buildings} atlas={atlas} leaving={leaving} onEnter={enter} stats={stats} />}

      {exploring && (
        <>
          {/* brand, floating on the map */}
          <Link
            href="/explore"
            onClick={() => scene?.home()}
            aria-label="Yielvy"
            className="yv-enter absolute left-4 top-4 z-30 rounded-[14px] border border-line bg-[#0b0f15e6] px-3.5 py-2.5 shadow-pop backdrop-blur hover:border-line-strong"
          >
            <Logo height={mobile ? 22 : 26} />
          </Link>

          {/* the one navigation: right-side panel */}
          {!mobile && (
            <aside
              aria-label="Explore panel"
              className="yv-enter absolute inset-y-0 right-0 z-20 flex flex-col overflow-hidden border-l border-[#1a2029] bg-[#05070a] shadow-pop"
              style={{ width: PANEL_W }}
            >
              <div className="flex items-center gap-2 px-4 pt-4">
                <label className="relative block flex-1">
                  <span className="sr-only">Search missions and projects</span>
                  <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setTab("discover");
                    }}
                    placeholder="Search missions & projects"
                    className="h-10 w-full rounded-[12px] border border-line-strong bg-[#0b0e13] pl-9 pr-3 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/25"
                  />
                </label>
                {viewer && <NotificationBell />}
                <UserMenu user={viewer} />
              </div>
              <nav aria-label="Sections" className="mx-4 mt-3 grid grid-cols-3 gap-1 rounded-[12px] bg-[#0b0e13] p-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openTab(t.id)}
                    aria-current={tab === t.id ? "page" : undefined}
                    className={`flex items-center justify-center gap-1.5 rounded-[9px] py-2 text-[13px] font-semibold transition-colors ${tab === t.id ? "bg-orange text-[#140c05] shadow-[0_6px_18px_-8px_rgb(255_145_56/.8)]" : "text-ink-3 hover:text-ink"}`}
                  >
                    <t.icon size={15} />
                    {t.label}
                  </button>
                ))}
              </nav>
              <div key={tab} className="yv-enter min-h-0 flex-1">{panelContent}</div>
            </aside>
          )}

          {/* mobile: account chip + section bar + sheet */}
          {mobile && (
            <>
              <div className="absolute right-3 top-4 z-30 flex items-center gap-1 rounded-full border border-line bg-[#0b0f15e6] p-1 backdrop-blur">
                {viewer && <NotificationBell />}
                <UserMenu user={viewer} />
              </div>
              <nav aria-label="Sections" className="absolute inset-x-3 bottom-3 z-20 grid grid-cols-3 rounded-[14px] border border-line bg-[#0b0f15f2] shadow-pop backdrop-blur">
                {TABS.map((t) => (
                  <button key={t.id} type="button" onClick={() => openTab(t.id)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-ink-2">
                    <t.icon size={18} className="text-orange" />
                    {t.label}
                  </button>
                ))}
              </nav>
              {sheetOpen && (
                <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/55" onClick={() => setSheetOpen(false)}>
                  <div role="dialog" aria-label="Explore panel" className="yv-enter flex h-[80dvh] flex-col rounded-t-[20px] border-t border-line bg-card" onClick={(e) => e.stopPropagation()}>
                    <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" />
                    <div className="flex shrink-0 border-b border-line">
                      {TABS.map((t) => (
                        <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`flex-1 py-3 text-[13px] font-semibold ${tab === t.id ? "text-orange" : "text-ink-3"}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <div className="min-h-0 flex-1">{panelContent}</div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* selected quest */}
          {selected &&
            (mobile ? (
              <div className="absolute inset-x-0 bottom-0 z-30 p-2">
                <SpaceCard b={selected} onClose={() => setSelectedId(null)} />
              </div>
            ) : (
              <div className="absolute bottom-4 z-30 w-[400px]" style={{ right: PANEL_W + 16 }}>
                <SpaceCard b={selected} onClose={() => setSelectedId(null)} />
              </div>
            ))}

          {/* back to the quest that sent the player here */}
          {back && (
            <Link
              href={back}
              className="yv-pop absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-orange/60 bg-[#0b0f15f2] px-4 py-2 text-[13px] font-semibold text-orange shadow-pop backdrop-blur hover:bg-[#151b25]"
            >
              ← Back to your mission
            </Link>
          )}

          {/* selected trail */}
          {route && (
            <div className={`absolute z-30 ${mobile ? "inset-x-2 bottom-[76px]" : "w-[360px]"}`} style={mobile ? undefined : { left: 72, bottom: 16, maxHeight: "calc(100% - 100px)" }}>
              <ExpeditionCard route={route} onClose={() => setRouteId(null)} onChapter={(spaceId) => select(spaceId)} />
            </div>
          )}

          {!mobile && (
            <div className="absolute bottom-6 left-6 z-20">
              <ZoomSlider scene={scene} />
            </div>
          )}

          {/* game status bar: real rewards and missions for the player */}
          {!mobile && (
            <div className="pointer-events-none absolute top-5 z-30 flex justify-center" style={{ left: 0, right: mapRight }}>
              <StatusBar viewer={data.viewer} live={stats.live} demo={data.demo} />
            </div>
          )}

          {empty && (
            <div className="yv-pop absolute left-1/2 top-1/2 z-20 w-[min(420px,calc(100%-24px))] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-line bg-[#0b0f15f2] p-6 text-center shadow-pop backdrop-blur">
              <h2 className="text-xl font-semibold">The map is waiting for its first mission.</h2>
              <Link href="/organizer" className={buttonClass("primary", "md", "mt-4")}>
                Host a mission
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
