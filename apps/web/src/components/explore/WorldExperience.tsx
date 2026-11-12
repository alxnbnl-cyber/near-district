"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateAtlas } from "@yielvy/core/world";
import type { AtlasScene } from "@/world/atlas-scene";
import type { WorldData } from "@/world/types";
import { buttonClass } from "@/components/ui";
import { UserMenu } from "@/components/shell/UserMenu";
import { MarkerLayer } from "./MarkerLayer";
import { Dock, frame, plate, ProfileBadge, StatusBar, ZoomSlider, type DockId } from "./GameHud";
import { DiscoverPanel, type Filter } from "./DiscoverPanel";
import { ProgressPanel } from "./ProgressPanel";
import { SpaceCard } from "./SpaceCard";
import { ExpeditionCard } from "./ExpeditionCard";
import { MapHud } from "./MapHud";
import { WelcomeOverlay } from "./WelcomeOverlay";
import { AmbientLayer } from "./AmbientLayer";
import { Minimap } from "./Minimap";
import { Tutorial, tutorialSeen } from "./Tutorial";
import { MissionModal } from "./MissionModal";
import { SignInModal } from "./SignInModal";
import { IconSearch } from "./icons";

const DRAWER_W = 400;
type Panel = Exclude<DockId, "guide">;


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
  const [panel, setPanel] = useState<Panel | null>(null);
  const [mission, setMission] = useState<{ slug: string; campaign: string } | null>(null);
  /** Partner jump: the modal fades out, a dot travels between the two pins, the modal comes back. */
  const [jump, setJump] = useState<{ from: string; to: string; key: number } | null>(null);
  const [modalAway, setModalAway] = useState(false);
  const [signIn, setSignIn] = useState<string | null>(null);
  // On the map, every sign-in link opens a modal over the live map instead of leaving the page.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (!window.location.pathname.startsWith("/explore")) return; // homepage keeps the full sign-in page
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== "/signin") return;
      e.preventDefault();
      const next = url.searchParams.get("next");
      setSignIn(next && next.startsWith("/") && !next.startsWith("//") ? next : window.location.pathname + window.location.search);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  const [tutorial, setTutorial] = useState(false);
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
    if (t === "discover") setPanel("explore");
    if (t === "adventures" || t === "experiences" || params.get("panel") === "progress") setPanel("progress");
    const m = params.get("m")?.match(/^([a-z0-9-]+)\/([a-z0-9-]+)$/);
    if (m) setMission({ slug: m[1]!, campaign: m[2]! });
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
  /** Missions open over the map; the URL keeps ?m= so links and the back button work. */
  const openMission = useCallback((slug: string, campaign: string) => {
    setMission({ slug, campaign });
    const url = new URL(window.location.href);
    url.searchParams.set("m", `${slug}/${campaign}`);
    window.history.pushState({ yvMission: true }, "", url);
  }, []);
  const closeMission = useCallback(() => {
    setMission(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("m")) {
      url.searchParams.delete("m");
      window.history.replaceState(null, "", url);
    }
  }, []);
  useEffect(() => {
    const onPop = () => {
      const m = new URLSearchParams(window.location.search).get("m")?.match(/^([a-z0-9-]+)\/([a-z0-9-]+)$/);
      setMission(m ? { slug: m[1]!, campaign: m[2]! } : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const jumpTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => jumpTimers.current.forEach(clearTimeout), []);
  const partnerJump = useCallback(
    (fromName: string | null, toName: string | null) => {
      if (!mission || !scene) return;
      const host = data.buildings.find((b) => b.slug === mission.slug);
      const byName = (n: string | null) => (n === null ? host : data.buildings.find((b) => b.name.toLowerCase() === n.toLowerCase()));
      const a = byName(fromName), b = byName(toName);
      if (!a || !b || a.spaceId === b.spaceId) return; // partner not on the map: just switch the secret
      jumpTimers.current.forEach(clearTimeout);
      jumpTimers.current = [];
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      // timeline (ms): the steps overlap so it reads as one continuous move
      const T = reduce
        ? { frame: 0, frameDur: 0, dot: 0, follow: 0, followDur: 0, back: 300, clear: 400 }
        : { frame: 0, frameDur: 1000, dot: 620, follow: 1500, followDur: 1150, back: 2350, clear: 3000 };
      setModalAway(true);
      const ax = a.x * atlas.width, ay = a.y * atlas.height, bx = b.x * atlas.width, by = b.y * atlas.height;
      const vw = document.documentElement.clientWidth || 1200, vh = document.documentElement.clientHeight || 800;
      const fit = Math.max(0.12, Math.min(0.7, Math.min(vw / (Math.abs(bx - ax) + 1500), vh / (Math.abs(by - ay) + 1200))));
      const at = (ms: number, fn: () => void) => jumpTimers.current.push(setTimeout(fn, ms));
      at(T.frame, () => scene.flyTo((ax + bx) / 2, (ay + by) / 2, fit, T.frameDur)); // glide out to frame both pins
      at(T.dot, () => setJump({ from: a.spaceId, to: b.spaceId, key: Date.now() })); // dot leaves while the camera settles
      at(T.follow, () => scene.flyTo(bx, by, Math.max(fit * 1.6, 0.5), T.followDur)); // camera drifts after the dot
      at(T.back, () => setModalAway(false)); // modal returns as the camera lands
      at(T.clear, () => setJump(null));
    },
    [mission, scene, data, atlas],
  );

  /** Pin click: zoom right in on the pin, then open its mission over the map. */
  const pinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickPin = useCallback(
    (id: string) => {
      const b = data.buildings.find((x) => x.spaceId === id);
      if (!b) return;
      // no small card: the pin zooms in and its mission opens as the modal
      setSelectedId(null);
      if (pinTimer.current) clearTimeout(pinTimer.current);
      if (!scene) return;
      const max = scene.zoomRange().max;
      scene.flyTo(b.x * atlas.width, b.y * atlas.height, max, 750);
      const f = b.featured;
      if (!f) return;
      // already zoomed in: open straight away (the camera still glides over while the modal grows)
      const zoomedIn = scene.camera().s >= max * 0.95;
      if (zoomedIn) openMission(b.slug, f.slug);
      else pinTimer.current = setTimeout(() => openMission(b.slug, f.slug), 700);
    },
    [data, scene, atlas, openMission],
  );
  useEffect(() => () => {
    if (pinTimer.current) clearTimeout(pinTimer.current);
  }, []);

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

  // First visit to the game (however the player got here): show the tutorial once.
  useEffect(() => {
    if (mode !== "explore" || tutorialSeen()) return;
    const t = setTimeout(() => setTutorial(true), 700);
    return () => clearTimeout(t);
  }, [mode]);

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
        setPanel("explore");
        setTimeout(() => searchRef.current?.focus(), 80);
      } else if (e.key === "Escape" && !typing) {
        setSelectedId((id) => {
          if (!id) setPanel(null);
          return null;
        });
      }
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
  const openPanel = (p: Panel) => {
    setPanel((cur) => (cur === p ? null : p));
    if (p === "explore") setTimeout(() => searchRef.current?.focus(), 80);
  };
  const onDock = (id: DockId) => {
    if (id === "guide") setTutorial(true);
    else openPanel(id);
  };
  const ink = "rgb(214 219 225";
  const drawerOpen = exploring && panel !== null;

  return (
    <div className="relative h-full w-full overflow-clip bg-paper">
      <div
        ref={host}
        tabIndex={exploring ? 0 : -1}
        role="application"
        aria-roledescription="map"
        aria-label="NEAR District map. Drag or use arrow keys to pan, scroll or plus and minus to zoom."
        onKeyDown={onMapKey}
        className={`absolute inset-0 outline-none transition-opacity duration-700 ${scene ? "opacity-100" : "opacity-0"}`}
        // tactical grade: grey map so the orange pins pop
        style={{ filter: "grayscale(1) contrast(1.12) brightness(1.08)", transition: "filter 700ms" }}
      />
      {/* living city: cars on the roads, drifting cloud shadows, flickering lights */}
      <AmbientLayer scene={scene} atlas={atlas} />
      {/* soft vignette: darkens the edges and corners so the map feels framed (never blocks input) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 75% 70% at 50% 50%, transparent 55%, rgb(5 7 11 / 0.55) 85%, rgb(5 7 11 / 0.85) 100%), linear-gradient(180deg, rgb(5 7 11 / 0.55), transparent 14%, transparent 86%, rgb(5 7 11 / 0.6))",
        }}
      />
      <MapHud scene={scene} right={0} visible={exploring || mode === "welcome"} compact={!exploring} />
      {failed && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-3">
          <p>The map couldn&apos;t start ({failed}).</p>
        </div>
      )}

      <div className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${exploring ? "opacity-100" : "opacity-0"}`}>
        <MarkerLayer
          atlas={atlas}
          scene={scene}
          buildings={data.buildings}
          visibleIds={visibleIds}
          selectedId={selectedId}
          interactive={exploring}
          onSelect={pickPin}
          onZoomTo={(x, y, s) => scene?.flyTo(x, y, s)}
          links={data.links ?? []}
          jump={jump}
        />
      </div>

      {(mode === "welcome" || leaving) && <WelcomeOverlay scene={scene} buildings={data.buildings} atlas={atlas} leaving={leaving} onEnter={enter} stats={stats} />}

      {exploring && (
        <>
          {/* top left: brand + map title (quiet, not a link) */}
          <div className="yv-enter pointer-events-none absolute left-6 top-6 z-30 flex select-none items-center gap-3 opacity-70">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/brand/yielvy-mark.webp" alt="" className="size-10 sm:size-11" />
            <span className="font-mono">
              <span className="block font-display text-[17px] font-bold leading-none tracking-[0.14em] text-[rgb(214_219_225/.85)] sm:text-[19px]">NEAR DISTRICT</span>
              <span className="mt-1 block text-[9px] uppercase tracking-[0.24em]" style={{ color: `${ink} / .45)` }}>
                {stats.spaces} project{stats.spaces === 1 ? "" : "s"} · {stats.live} mission{stats.live === 1 ? "" : "s"}
              </span>
            </span>
          </div>

          {/* top centre: player status */}
          {!mobile && (
            <div className="pointer-events-none absolute inset-x-0 top-6 z-30 flex justify-center">
              <StatusBar viewer={data.viewer} live={stats.live} />
            </div>
          )}

          {/* top right: player badge */}
          <div className="yv-enter absolute right-6 top-5 z-40">
            <UserMenu user={viewer} dark avatar={<ProfileBadge name={viewer?.displayName ?? null} />} />
          </div>

          {/* left centre: zoom */}
          {!mobile && (
            <div className="absolute left-6 top-1/2 z-20 -translate-y-1/2">
              <ZoomSlider scene={scene} />
            </div>
          )}

          {/* right edge: small expand handle that opens the explore panel */}
          {!drawerOpen && (
            <button
              type="button"
              onClick={() => openPanel("explore")}
              aria-label="Open explore panel"
              title="Explore"
              className="absolute right-0 top-1/2 z-20 grid h-14 w-6 -translate-y-1/2 place-items-center bg-[rgb(5_7_10/.7)] text-[rgb(214_219_225/.55)] backdrop-blur transition-colors hover:w-7 hover:text-white"
              style={{ clipPath: "polygon(8px 0, 100% 0, 100% 100%, 8px 100%, 0 calc(100% - 8px), 0 8px)", boxShadow: "inset 0 0 0 1px rgb(214 219 225 / .2)" }}
            >
              <svg aria-hidden width="10" height="10" viewBox="0 0 10 10">
                <path d="M6.5 1.5 3 5l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {/* right drawer: search + results (or progress) */}
          <aside
            aria-label={panel === "progress" ? "Progress" : "Search"}
            inert={!drawerOpen}
            className={`absolute inset-y-0 right-0 z-[60] flex flex-col bg-[linear-gradient(160deg,rgb(8_11_16/.8),rgb(2_3_5/.9))] font-mono backdrop-blur-xl backdrop-saturate-150 transition-transform duration-300 ease-out ${drawerOpen ? "translate-x-0" : "translate-x-full"}`}
            style={{ width: mobile ? "100%" : DRAWER_W, boxShadow: `-30px 0 60px -20px rgb(0 0 0 / .8)` }}
          >
            <span aria-hidden className="absolute inset-y-0 left-0 w-px bg-[rgb(255_255_255/.22)]" />
            <div className="flex items-center justify-between px-5 pb-3 pt-5">
              <div>
                {panel === "progress" && <p className="text-[9.5px] font-bold uppercase tracking-[0.32em] text-orange">Player card</p>}
                <h2 className="mt-0.5 font-display text-[20px] font-bold uppercase tracking-[0.1em] text-white">{panel === "progress" ? "Progress" : "Search"}</h2>
              </div>
              <button type="button" onClick={() => setPanel(null)} className="grid size-8 place-items-center text-[rgb(214_219_225/.6)] hover:text-white" aria-label="Close panel" style={{ boxShadow: `inset 0 0 0 1px ${ink} / .2)` }}>
                ✕
              </button>
            </div>
            {panel === "progress" ? (
              <div className="min-h-0 flex-1">
                <ProgressPanel viewer={data.viewer} signedIn={Boolean(viewer)} onFocusSpace={select} onPlay={openMission} />
              </div>
            ) : (
              <>
                <div className="px-5">
                  <label className="relative block">
                    <span className="sr-only">Search missions and projects</span>
                    <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-orange" />
                    <input
                      ref={searchRef}
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="SEARCH MISSIONS & PROJECTS"
                      className="h-11 w-full border border-[rgb(255_255_255/.14)] bg-[rgb(60_76_100/.12)] pl-9 pr-3 text-[12px] uppercase tracking-[0.12em] text-white placeholder:text-[rgb(214_219_225/.35)] focus:border-orange focus:outline-none"
                    />
                  </label>
                </div>
                <div className="min-h-0 flex-1 font-sans">
                  <DiscoverPanel
                    showSearch={false}
                    hideFooter
                    results={results}
                    total={data.buildings.length}
                    query={query}
                    filter={filter}
                    selectedId={selectedId}
                    onQuery={setQuery}
                    onFilter={setFilter}
                    onPick={(id) => {
                      select(id);
                      if (mobile) setPanel(null);
                    }}
                    onAbout={() => setTutorial(true)}
                  />
                </div>
              </>
            )}
          </aside>

          {/* bottom centre: game menu */}
          <div className={`pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center ${mobile ? "origin-bottom scale-[.78]" : ""}`}>
            <Dock active={panel} onPick={onDock} />
          </div>

          {/* bottom right: minimap */}
          {!mobile && (
            <div className="absolute bottom-5 right-5 z-20">
              <Minimap scene={scene} atlas={atlas} buildings={data.buildings} />
            </div>
          )}

          {/* selected mission */}
          {selected &&
            (mobile ? (
              <div className="absolute inset-x-0 bottom-0 z-40 p-2">
                <SpaceCard b={selected} onClose={() => setSelectedId(null)} onPlay={openMission} />
              </div>
            ) : (
              <div className="yv-enter absolute bottom-[116px] left-[88px] z-30 w-[360px]">
                <SpaceCard b={selected} onClose={() => setSelectedId(null)} onPlay={openMission} />
              </div>
            ))}

          {/* back to the mission that sent the player here */}
          {back && (
            <Link
              href={back}
              className="yv-pop absolute left-1/2 top-[92px] z-30 flex -translate-x-1/2 items-center gap-2 bg-[#0b0f15f2] px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-orange shadow-pop backdrop-blur hover:bg-[#151b25]"
              style={frame(9, "rgb(255 145 56 / .6)")}
            >
              ← Back to your mission
            </Link>
          )}

          {/* selected trail */}
          {route && (
            <div className={`absolute z-30 ${mobile ? "inset-x-2 bottom-[96px]" : "w-[360px]"}`} style={mobile ? undefined : { left: 88, bottom: selected ? 340 : 24, maxHeight: "calc(100% - 140px)" }}>
              <ExpeditionCard route={route} onClose={() => setRouteId(null)} onChapter={(spaceId) => select(spaceId)} />
            </div>
          )}

          {empty && (
            <div className="yv-pop absolute left-1/2 top-1/2 z-20 w-[min(420px,calc(100%-24px))] -translate-x-1/2 -translate-y-1/2 bg-[#0b0f15f2] p-6 text-center shadow-pop backdrop-blur" style={frame(14, "rgb(214 219 225 / .18)")}>
              <h2 className="text-xl font-semibold">The map is waiting for its first mission.</h2>
              <Link href="/host?from=map" className={buttonClass("primary", "md", "mt-4")}>
                Host a mission
              </Link>
            </div>
          )}
        </>
      )}

      <Tutorial open={tutorial} onClose={() => setTutorial(false)} />
      {signIn && <SignInModal next={signIn} onClose={() => setSignIn(null)} />}
      {mission && <MissionModal key={`${mission.slug}/${mission.campaign}`} slug={mission.slug} campaign={mission.campaign} onClose={closeMission} onOpen={openMission} onPartnerJump={partnerJump} away={modalAway} />}
    </div>
  );
}
