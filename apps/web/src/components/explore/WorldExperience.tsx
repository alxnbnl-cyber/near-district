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
import { Legend, ZoomControls } from "./MapChrome";
import { DiscoverPanel, type Filter } from "./DiscoverPanel";
import { AdventuresTab, ExperiencesTab } from "./PanelTabs";
import { SpaceCard } from "./SpaceCard";
import { ExpeditionCard } from "./ExpeditionCard";
import { WelcomeOverlay } from "./WelcomeOverlay";
import { IconCompass, IconFlag, IconMap, IconPlus, IconSearch } from "./icons";

const WELCOME_KEY = "yielvy.welcome.v1";
const PANEL_W = 380;
const TOPBAR_H = 64;

export type Tab = "discover" | "experiences" | "adventures";
const TABS: { id: Tab; label: string; icon: typeof IconCompass }[] = [
  { id: "discover", label: "Explore", icon: IconCompass },
  { id: "experiences", label: "Experiences", icon: IconFlag },
  { id: "adventures", label: "Adventures", icon: IconMap },
];

function readSeen(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === "seen";
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    localStorage.setItem(WELCOME_KEY, "seen");
  } catch {
    /* private mode: the welcome simply shows again next time */
  }
}

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
  /** Where "Explore Partner Space" came from; only our own hunt pages are accepted. */
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
      if (readSeen() && !params.has("welcome")) {
        setMode("explore");
        window.history.replaceState(null, "", "/explore");
      } else setMode("welcome");
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
      mode === "welcome" ? { left: mobile ? 0 : w * 0.42, right: 0, bottom: 0 } : { left: 0, right: !mobile ? PANEL_W + 24 : 0, bottom: mobile && selectedId ? 300 : 0 };
  }, [scene, mode, mobile, selectedId]);

  const route = routeId ? (data.routes.find((r) => r.id === routeId) ?? null) : null;
  const routeSpaces = useMemo(() => (route ? new Set(route.chapters.map((c) => c.spaceId)) : null), [route]);

  // Areas: every live Space normally; only the expedition's destinations while one is selected.
  useEffect(() => {
    scene?.setAreas(
      data.buildings
        .filter((b) => !routeSpaces || routeSpaces.has(b.spaceId))
        .map((b) => ({ id: b.spaceId, x: b.x * atlas.width, y: b.y * atlas.height, live: routeSpaces ? true : b.liveCampaigns > 0 })),
      selectedId,
    );
  }, [scene, data, atlas, selectedId, routeSpaces]);

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
      const vw = (el?.clientWidth ?? 1200) - (mobile ? 0 : PANEL_W + 24), vh = el?.clientHeight ?? 800;
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
    markSeen();
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
        aria-label="Yielvy city map. Drag or use arrow keys to pan, scroll or plus and minus to zoom."
        onKeyDown={onMapKey}
        className={`absolute inset-x-0 bottom-0 outline-none transition-opacity duration-700 ${scene ? "opacity-100" : "opacity-0"}`}
        style={{ top: exploring ? TOPBAR_H : 0 }}
      />
      {failed && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-3">
          <p>The map couldn&apos;t start ({failed}).</p>
        </div>
      )}

      <div className={`absolute inset-x-0 bottom-0 transition-opacity duration-500 ${exploring ? "opacity-100" : "opacity-0"}`} style={{ top: exploring ? TOPBAR_H : 0 }}>
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
          {/* top bar */}
          <header className="yv-enter absolute inset-x-0 top-0 z-40 flex items-center gap-3 border-b border-line bg-[#0b0f15f5] px-3 backdrop-blur md:gap-6 md:px-6" style={{ height: TOPBAR_H }}>
            <Link href="/explore" onClick={() => scene?.home()} aria-label="Yielvy" className="shrink-0">
              <Logo height={mobile ? 24 : 30} />
            </Link>
            {!mobile && (
              <nav aria-label="Sections" className="ml-4 flex h-full items-stretch">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openTab(t.id)}
                    aria-current={tab === t.id ? "page" : undefined}
                    className={`relative flex items-center gap-2 px-4 text-[14px] font-semibold transition-colors ${tab === t.id ? "text-orange" : "text-ink-3 hover:text-ink"}`}
                  >
                    <t.icon size={16} />
                    {t.label}
                    {tab === t.id && <span aria-hidden className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-orange" />}
                  </button>
                ))}
              </nav>
            )}
            <div className="ml-auto flex items-center gap-2">
              {!mobile ? (
                <label className="relative block">
                  <span className="sr-only">Search Spaces and experiences</span>
                  <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setTab("discover");
                    }}
                    placeholder="Search Spaces, hunts, contests…"
                    className="h-10 w-[280px] rounded-[12px] border border-line-strong bg-[#121722] pl-9 pr-3 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/25 lg:w-[340px]"
                  />
                </label>
              ) : (
                <button type="button" aria-label="Search" onClick={() => openTab("discover")} className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-paper-2">
                  <IconSearch />
                </button>
              )}
              {!mobile && (
                <Link href="/host" className={buttonClass("dark", "sm", "h-10")}>
                  <IconPlus size={15} /> Host a Space
                </Link>
              )}
              {viewer && <NotificationBell />}
              <UserMenu user={viewer} />
            </div>
          </header>

          {/* right panel */}
          {!mobile && (
            <aside
              aria-label={TABS.find((t) => t.id === tab)!.label}
              className="yv-enter absolute bottom-4 right-4 z-20 flex flex-col overflow-hidden rounded-[16px] border border-line bg-[#0b0f15f2] shadow-pop backdrop-blur"
              style={{ width: PANEL_W, top: TOPBAR_H + 16 }}
            >
              {panelContent}
            </aside>
          )}

          {/* map key (top-left of the map) */}
          {!mobile && (
            <div className="absolute left-4 z-20" style={{ top: TOPBAR_H + 16 }}>
              <Legend hasRoutes={data.routes.length > 0} />
            </div>
          )}

          {/* mobile: section bar + sheet */}
          {mobile && (
            <>
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
                  <div role="dialog" aria-label="Map panel" className="yv-enter flex h-[80dvh] flex-col rounded-t-[20px] border-t border-line bg-card" onClick={(e) => e.stopPropagation()}>
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

          {/* selected Space */}
          {selected &&
            (mobile ? (
              <div className="absolute inset-x-0 bottom-0 z-30 p-2">
                <SpaceCard b={selected} onClose={() => setSelectedId(null)} />
              </div>
            ) : (
              <div className="absolute bottom-4 z-30 w-[420px]" style={{ right: PANEL_W + 32 }}>
                <SpaceCard b={selected} onClose={() => setSelectedId(null)} />
              </div>
            ))}

          {/* back to the hunt that sent the player here */}
          {back && (
            <Link
              href={back}
              className="yv-enter absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-orange/60 bg-[#0b0f15f2] px-4 py-2 text-[13px] font-semibold text-orange shadow-pop backdrop-blur hover:bg-[#151b25]"
              style={{ top: TOPBAR_H + 14 }}
            >
              ← Back to your hunt
            </Link>
          )}

          {/* selected expedition: chapters in their approved order */}
          {route && (
            <div
              className={`absolute z-30 ${mobile ? "inset-x-2 bottom-[76px]" : "w-[360px]"}`}
              style={mobile ? undefined : { left: 72, bottom: 16, maxHeight: `calc(100% - ${TOPBAR_H + 80}px)` }}
            >
              <ExpeditionCard route={route} onClose={() => setRouteId(null)} onChapter={(spaceId) => select(spaceId)} />
            </div>
          )}

          {/* zoom (bottom-left) */}
          {!mobile && (
            <div className="absolute bottom-4 left-4 z-20">
              <ZoomControls scene={scene} />
            </div>
          )}

          {empty && (
            <div className="absolute left-1/2 top-1/2 z-20 w-[min(420px,calc(100%-24px))] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-line bg-[#0b0f15f2] p-6 text-center shadow-pop backdrop-blur">
              <h2 className="text-xl font-semibold">Every adventure starts somewhere.</h2>
              <p className="mt-1.5 text-sm text-ink-2">The first Spaces are getting ready. Be among the first to host one.</p>
              <Link href="/host" className={buttonClass("primary", "md", "mt-4")}>
                Host a Space
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
