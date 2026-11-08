"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateAtlas } from "@yielvy/core/world";
import type { AtlasScene } from "@/world/atlas-scene";
import type { WorldData } from "@/world/types";
import { buttonClass } from "@/components/ui";
import { MarkerLayer } from "./MarkerLayer";
import { Legend, Minimap, ZoomControls } from "./MapChrome";
import { DiscoverPanel, type Filter } from "./DiscoverPanel";
import { SpaceCard } from "./SpaceCard";
import { WelcomeOverlay } from "./WelcomeOverlay";
import { IconSearch } from "./icons";

const WELCOME_KEY = "yielvy.welcome.v1";
const PANEL_W = 340;

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

export function WorldExperience({ data, initialMode }: { data: WorldData; initialMode: "welcome" | "explore" }) {
  const atlas = useMemo(() => generateAtlas(), []);
  const host = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [scene, setScene] = useState<AtlasScene | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode === "explore" ? "explore" : "pending");
  const [leaving, setLeaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Decide welcome vs. world. Returning visitors skip straight to the world.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setMobile(mq.matches);
    const onMq = () => setMobile(mq.matches);
    mq.addEventListener("change", onMq);
    if (initialMode === "welcome") {
      const forced = new URLSearchParams(window.location.search).has("welcome");
      if (readSeen() && !forced) {
        setMode("explore");
        window.history.replaceState(null, "", "/explore");
      } else setMode("welcome");
    }
    return () => mq.removeEventListener("change", onMq);
  }, [initialMode]);

  // Mount the renderer once.
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
        setScene(s);
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "The map could not start");
      }
    })();
    return () => {
      cancelled = true;
      s?.destroy();
    };
  }, [atlas, initialMode]);

  // Keep the scene in sync with mode and layout.
  useEffect(() => {
    if (!scene) return;
    scene.setInteractive(mode === "explore");
    scene.focusPadding = { left: !mobile && mode === "explore" && panelOpen ? PANEL_W + 24 : 0, bottom: mobile && selectedId ? 260 : 0 };
  }, [scene, mode, panelOpen, mobile, selectedId]);

  useEffect(() => {
    scene?.setRoutes(
      data.routes.flatMap((r) => {
        const pts = r.stops.map((st) => data.buildings.find((b) => b.spaceId === st.spaceId)).filter(Boolean).map((b) => [b!.x * atlas.width, b!.y * atlas.height] as [number, number]);
        return pts.length > 1 ? [{ id: r.id, points: pts, completedSegments: r.stops.filter((x) => x.completed).length - 1 }] : [];
      }),
    );
  }, [scene, data, atlas]);

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

  const select = useCallback(
    (id: string) => {
      const b = data.buildings.find((x) => x.spaceId === id);
      if (!b) return;
      setSelectedId(id);
      setSheetOpen(false);
      scene?.flyTo(b.x * atlas.width, b.y * atlas.height, 0.75);
    },
    [data, scene, atlas],
  );

  const enter = () => {
    markSeen();
    setLeaving(true);
    window.history.pushState(null, "", "/explore");
    setTimeout(() => {
      setMode("explore");
      setLeaving(false);
      scene?.home();
    }, 320);
  };

  // Keyboard: "/" focuses search, Esc clears selection, arrows pan when the map has focus.
  useEffect(() => {
    if (mode !== "explore") return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input,textarea,select");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        if (mobile) setSheetOpen(true);
        else setPanelOpen(true);
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
      Home: () => scene.home(),
    };
    if (m[e.key]) {
      e.preventDefault();
      m[e.key]!();
    }
  };

  const exploring = mode === "explore";
  const empty = data.buildings.length === 0;
  const panelProps = {
    results,
    total: data.buildings.length,
    query,
    filter,
    selectedId,
    onQuery: setQuery,
    onFilter: setFilter,
    onPick: select,
    onAbout: () => {
      setSelectedId(null);
      setMode("welcome");
    },
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-paper">
      <div
        ref={host}
        tabIndex={exploring ? 0 : -1}
        role="application"
        aria-roledescription="map"
        aria-label="Yielvy city map. Arrow keys pan, plus and minus zoom, Home returns to Central Plaza. Use the Discover panel to find Spaces."
        onKeyDown={onMapKey}
        className={`absolute inset-0 outline-none transition-[filter,opacity] duration-700 ${scene ? "opacity-100" : "opacity-0"} ${exploring ? "" : "brightness-[.9]"}`}
      />
      {failed && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-3">
          <p>
            The map couldn&apos;t start ({failed}). <Link className="text-orange-ink underline" href="/experiences">Browse experiences as a list</Link>.
          </p>
        </div>
      )}

      <div className={`transition-opacity duration-500 ${exploring ? "opacity-100" : "opacity-40"}`}>
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

      {(mode === "welcome" || leaving) && <WelcomeOverlay leaving={leaving} onEnter={enter} />}

      {exploring && (
        <>
          {/* Desktop: collapsible Discover panel */}
          {!mobile &&
            (panelOpen ? (
              <div className="yv-enter absolute bottom-4 left-4 top-4 z-20 overflow-hidden rounded-[16px] border border-line bg-[#0e131bf0] shadow-pop backdrop-blur" style={{ width: PANEL_W }}>
                <DiscoverPanel ref={searchRef} {...panelProps} onCollapse={() => setPanelOpen(false)} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="yv-enter absolute left-4 top-4 z-20 flex h-11 items-center gap-2 rounded-[12px] border border-line bg-[#0e131bf0] px-4 text-[13.5px] font-semibold shadow-pop backdrop-blur hover:border-line-strong"
              >
                <IconSearch size={16} className="text-orange" /> Discover Spaces
              </button>
            ))}

          {/* Mobile: search button + bottom sheet */}
          {mobile && (
            <>
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="absolute left-3 right-16 top-3 z-20 flex h-11 items-center gap-2 rounded-[12px] border border-line bg-[#0e131bf0] px-4 text-left text-[13.5px] text-ink-3 shadow-pop backdrop-blur"
              >
                <IconSearch size={16} className="text-orange" /> Search Spaces &amp; experiences
              </button>
              {sheetOpen && (
                <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black/50" onClick={() => setSheetOpen(false)}>
                  <div role="dialog" aria-label="Discover Spaces" className="yv-enter flex h-[78dvh] flex-col rounded-t-[20px] border-t border-line bg-card" onClick={(e) => e.stopPropagation()}>
                    <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong" />
                    <DiscoverPanel ref={searchRef} {...panelProps} onCollapse={() => setSheetOpen(false)} />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Selected Space */}
          {selected &&
            (mobile ? (
              <div className="absolute inset-x-0 bottom-0 z-30 p-2">
                <SpaceCard b={selected} onClose={() => setSelectedId(null)} />
              </div>
            ) : (
              <div className="absolute bottom-4 z-30 w-[420px]" style={{ left: (panelOpen ? PANEL_W + 32 : 16) }}>
                <SpaceCard b={selected} onClose={() => setSelectedId(null)} />
              </div>
            ))}

          {/* Map chrome */}
          <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2 md:right-4 md:top-4">
            <Minimap atlas={atlas} scene={scene} buildings={data.buildings} />
            <ZoomControls scene={scene} />
          </div>
          {!selected && (
            <div className="absolute bottom-4 right-4 z-20">
              <Legend hasRoutes={data.routes.length > 0} />
            </div>
          )}

          {empty && (
            <div className="absolute inset-x-3 bottom-6 z-20 mx-auto max-w-md rounded-[16px] border border-line bg-[#0e131bf2] p-6 text-center shadow-pop backdrop-blur md:left-[380px] md:right-auto md:mx-0">
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
