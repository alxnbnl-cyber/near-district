"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { WorldExperience, WorldRoute } from "@/world/types";
import { api, ApiError } from "@/lib/api";
import { buttonClass } from "@/components/ui";
import { IconFlag, IconStar } from "./icons";
import { PrizeChip } from "./PrizeChip";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" }) : "");

/** Quests tab: open quests (prizes first) and multi-vault trails. */
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
  const shown = items
    .filter((e) => kind === "all" || e.template === kind)
    .sort((a, b) => Number(b.rewards === "token") - Number(a.rewards === "token"));
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-1.5 px-4 pt-4" role="group" aria-label="Type">
        {(
          [
            ["all", "All"],
            ["treasure_hunt", "Missions"],
            ["creative_contest", "Challenges"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={kind === id}
            onClick={() => setKind(id)}
            className={`h-7 rounded-full border px-3 text-[12.5px] font-semibold ${kind === id ? "border-orange bg-orange-wash text-orange-ink" : "border-line-strong text-ink-2 hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="yv-stagger mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
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
                  className={`block w-full rounded-[14px] border p-3 text-left transition-all hover:-translate-y-px ${sel ? "border-sky/70 bg-[linear-gradient(100deg,rgb(50_200_239/0.18),rgb(50_200_239/0.03))]" : "border-line bg-[#0b0e13] hover:border-line-strong"}`}
                >
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-sky">Trail · {r.chapters.length} stops</p>
                  <p className="mt-1 font-semibold">{r.title}</p>
                  <div className="mt-2 flex items-center gap-1">
                    {r.chapters.map((c, i) => (
                      <span key={i} className={`h-1.5 flex-1 rounded-full ${c.completed ? "bg-orange" : "bg-line-strong"}`} />
                    ))}
                  </div>
                  <p className="mt-1.5 text-[12px] text-ink-3">{r.completedAt ? "Completed" : done ? `${done} of ${r.chapters.length} done` : "Tap to see the route"}</p>
                </button>
              </li>
            );
          })}
        {shown.length === 0 && (
          <li className="px-2 py-8 text-center text-[13px] text-ink-3">
            No missions open yet.
            <br />
            <Link href="/organizer" className="font-semibold text-orange-ink hover:underline">
              Host the first one
            </Link>
          </li>
        )}
        {shown.map((e) => {
          const hunt = e.template === "treasure_hunt";
          const Icon = hunt ? IconFlag : IconStar;
          return (
            <li key={e.id} className={`rounded-[14px] p-3 ${e.rewards === "token" ? "card-reward" : "border border-line bg-[#0b0e13]"}`}>
              <button type="button" onClick={() => onFocusSpace(e.spaceId)} className="block w-full text-left">
                <div className="flex items-center justify-between gap-2">
                  <p className={`flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] ${hunt ? "text-sky" : "text-violet-ink"}`}>
                    <Icon size={12} /> {hunt ? "Mission" : "Challenge"}
                  </p>
                  <span className="text-[11.5px] text-ink-3">{e.status === "LIVE" ? (e.endsAt ? `Ends ${fmt(e.endsAt)}` : "Open now") : `Starts ${fmt(e.startsAt)}`}</span>
                </div>
                <p className="mt-1 font-semibold">{e.title}</p>
                <p className="text-[12.5px] text-ink-3">{e.spaceName}</p>
              </button>
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <PrizeChip prize={e.prize} rewards={e.rewards} />
                <Link href={`/s/${e.spaceSlug}/c/${e.slug}`} className={buttonClass("primary", "sm")}>
                  {hunt ? "Play" : "Join"}
                </Link>
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

/** Me tab: the player's own quests and rewards. */
export function AdventuresTab({ signedIn, onFocusSpace }: { signedIn: boolean; onFocusSpace(spaceId: string): void }) {
  const [items, setItems] = useState<Adventure[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    api<{ items: Adventure[] }>("/api/me/adventures")
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your missions."));
  }, [signedIn]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {!signedIn ? (
          <div className="rounded-[14px] border border-dashed border-line-strong p-5 text-center">
            <p className="font-semibold">Sign in to save your loot</p>
            <p className="mt-1 text-[13px] text-ink-3">Your progress and prizes are kept safe.</p>
            <Link href="/signin?next=/explore" className={buttonClass("primary", "md", "mt-4")}>
              Sign in
            </Link>
          </div>
        ) : error ? (
          <p className="px-2 py-6 text-center text-[13px] text-danger">{error}</p>
        ) : !items ? (
          <p className="px-2 py-6 text-center text-[13px] text-ink-3">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-8 text-center text-[13px] text-ink-3">No missions yet. Pick a glowing pin on the map to start.</p>
        ) : (
          <ul className="yv-stagger space-y-2">
            {items.map((a) => (
              <li key={a.id} className="rounded-[14px] border border-line bg-[#0b0e13] p-3">
                <p className={`text-[10.5px] font-bold uppercase tracking-[0.14em] ${a.template === "treasure_hunt" ? "text-sky" : "text-violet-ink"}`}>{a.badge}</p>
                <p className="mt-1 font-semibold">{a.title}</p>
                <p className="text-[12.5px] text-ink-3">
                  {a.spaceName} · {a.progress}
                </p>
                <div className="mt-2 flex gap-2">
                  <Link href={a.href} className={buttonClass("dark", "sm")}>
                    Continue
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
        <div className="flex justify-between border-t border-line px-4 py-3 text-[12.5px]">
          <Link href="/me/rewards" className="font-semibold text-reward">
            My rewards →
          </Link>
          <Link href="/me/profile" className="text-ink-3 hover:text-ink">
            Wallet & profile
          </Link>
        </div>
      )}
    </div>
  );
}
