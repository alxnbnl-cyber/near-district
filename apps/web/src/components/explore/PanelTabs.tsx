"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { WorldExperience, WorldRoute } from "@/world/types";
import { api, ApiError } from "@/lib/api";
import { buttonClass } from "@/components/ui";
import { IconFlag, IconStar } from "./icons";
import { KIND_COLOR } from "./MarkerLayer";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" }) : "");

/** Every open experience in the world. Selecting one focuses its Space on the map. */
export function ExperiencesTab({
  items,
  routes,
  selectedRouteId,
  onSelectRoute,
  onFocusSpace,
}: {
  items: WorldExperience[];
  routes: WorldRoute[];
  selectedRouteId: string | null;
  onSelectRoute(id: string): void;
  onFocusSpace(spaceId: string): void;
}) {
  const [kind, setKind] = useState<"all" | "treasure_hunt" | "creative_contest">("all");
  const shown = items.filter((e) => kind === "all" || e.template === kind);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-5 pt-5">
        <h2 className="text-[19px] font-semibold">Experiences</h2>
        <p className="text-[13px] text-ink-3">Hunts and challenges open right now.</p>
        <div className="mt-3 flex gap-1.5" role="group" aria-label="Type">
          {(
            [
              ["all", "All"],
              ["treasure_hunt", "Treasure Hunts"],
              ["creative_contest", "Creative Contests"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={kind === id}
              onClick={() => setKind(id)}
              className={`h-7 rounded-full border px-3 text-[12.5px] font-medium ${kind === id ? "border-orange bg-orange-wash text-orange-ink" : "border-line-strong text-ink-2 hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {routes.length > 0 && kind === "all" && (
          <li className="px-2 pb-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-sky">Shared expeditions</li>
        )}
        {kind === "all" &&
          routes.map((r) => {
            const done = r.chapters.filter((c) => c.completed).length;
            const sel = r.id === selectedRouteId;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelectRoute(r.id)}
                  aria-pressed={sel}
                  className={`block w-full rounded-[12px] border p-3 text-left transition-colors ${sel ? "border-orange/70 bg-[linear-gradient(100deg,rgb(255_145_56/0.24),rgb(255_145_56/0.05))]" : "border-line bg-paper/40 hover:border-line-strong"}`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky">{r.chapters.length} chapters · {new Set(r.chapters.map((c) => c.spaceId)).size} Spaces</p>
                  <p className="mt-1 font-semibold">{r.title}</p>
                  <p className="text-[12.5px] text-ink-3">{r.completedAt ? "Completed" : done ? `${done} of ${r.chapters.length} done` : r.summary || "Show the route on the map"}</p>
                </button>
              </li>
            );
          })}
        {routes.length > 0 && kind === "all" && shown.length > 0 && (
          <li className="px-2 pb-1 pt-3 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">Open now</li>
        )}
        {shown.length === 0 && (
          <li className="px-2 py-8 text-center text-[13px] text-ink-3">
            No experiences are open yet.
            <br />
            <Link href="/host" className="font-semibold text-orange-ink hover:underline">
              Host the first one
            </Link>
          </li>
        )}
        {shown.map((e) => {
          const hunt = e.template === "treasure_hunt";
          const color = hunt ? KIND_COLOR.hunt : KIND_COLOR.contest;
          const Icon = hunt ? IconFlag : IconStar;
          return (
            <li key={e.id} className="rounded-[12px] border border-line bg-paper/40 p-3 hover:border-line-strong">
              <button type="button" onClick={() => onFocusSpace(e.spaceId)} className="block w-full text-left">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color }}>
                  <Icon size={12} /> {hunt ? "Treasure Hunt" : "Creative Contest"} · {e.status === "LIVE" ? `Live${e.endsAt ? ` until ${fmt(e.endsAt)}` : ""}` : `Starts ${fmt(e.startsAt)}`}
                </p>
                <p className="mt-1 font-semibold">{e.title}</p>
                <p className="text-[12.5px] text-ink-3">
                  by {e.spaceName} · {e.rewards === "token" ? "Token rewards" : "No token rewards"}
                </p>
              </button>
              <div className="mt-2 flex gap-2">
                <Link href={`/s/${e.spaceSlug}/c/${e.slug}`} className={buttonClass("primary", "sm")}>
                  {hunt ? "Start Exploring" : "Submit Your Idea"}
                </Link>
                <button type="button" onClick={() => onFocusSpace(e.spaceId)} className={buttonClass("dark", "sm")}>
                  Show on map
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface Adventure {
  id: string;
  template: "treasure_hunt" | "creative_contest";
  title: string;
  spaceId: string;
  spaceName: string;
  href: string;
  campaignStatus: string;
  progress: string;
  badge: string;
}

/** The explorer's own journey: hunts in progress, finished, contest entries and results. */
export function AdventuresTab({ signedIn, onFocusSpace }: { signedIn: boolean; onFocusSpace(spaceId: string): void }) {
  const [items, setItems] = useState<Adventure[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    api<{ items: Adventure[] }>("/api/me/adventures")
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your adventures."));
  }, [signedIn]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-5 pt-5">
        <h2 className="text-[19px] font-semibold">My Adventures</h2>
        <p className="text-[13px] text-ink-3">Everything you&apos;ve started, finished or entered.</p>
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {!signedIn ? (
          <div className="rounded-[12px] border border-dashed border-line-strong p-5 text-center">
            <p className="font-semibold">Your journey starts with a sign-in</p>
            <p className="mt-1 text-[13px] text-ink-3">We save your progress so you can stop and come back any time.</p>
            <Link href="/signin?next=/explore" className={buttonClass("primary", "md", "mt-4")}>
              Sign in
            </Link>
          </div>
        ) : error ? (
          <p className="px-2 py-6 text-center text-[13px] text-danger">{error}</p>
        ) : !items ? (
          <p className="px-2 py-6 text-center text-[13px] text-ink-3">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-8 text-center text-[13px] text-ink-3">Nothing yet. Pick a cyan or violet marker on the map to begin.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((a) => (
              <li key={a.id} className="rounded-[12px] border border-line bg-paper/40 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: a.template === "treasure_hunt" ? KIND_COLOR.hunt : KIND_COLOR.contest }}>
                  {a.template === "treasure_hunt" ? "Treasure Hunt" : "Creative Contest"} · {a.badge}
                </p>
                <p className="mt-1 font-semibold">{a.title}</p>
                <p className="text-[12.5px] text-ink-3">
                  {a.spaceName} · {a.progress}
                </p>
                <div className="mt-2 flex gap-2">
                  <Link href={a.href} className={buttonClass("dark", "sm")}>
                    Open
                  </Link>
                  <button type="button" onClick={() => onFocusSpace(a.spaceId)} className={buttonClass("ghost", "sm")}>
                    Show on map
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {signedIn && (
        <div className="flex justify-between border-t border-line px-5 py-3 text-[12.5px]">
          <Link href="/me/rewards" className="font-semibold text-orange-ink hover:underline">
            My Rewards
          </Link>
          <Link href="/me/profile" className="text-ink-3 hover:text-ink">
            Profile & wallet
          </Link>
        </div>
      )}
    </div>
  );
}
