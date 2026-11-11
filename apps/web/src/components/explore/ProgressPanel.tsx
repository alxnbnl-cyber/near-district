"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ViewerStats } from "@/world/types";
import { api, ApiError } from "@/lib/api";
import { ClaimButton } from "@/app/me/rewards/ClaimButton";
import { GameIcon } from "@/components/host/GameIcon";
import { frame, plate } from "./frame";

const INK = "rgb(214 219 225";

/** Explorer ranks, earned only by finishing real missions. */
const RANKS = [
  { at: 0, name: "Rookie explorer" },
  { at: 1, name: "Pathfinder" },
  { at: 3, name: "Trailblazer" },
  { at: 6, name: "Treasure hunter" },
  { at: 10, name: "Legend" },
];

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
interface Reward {
  id: string;
  title: string;
  spaceName: string;
  amount: string;
  state: "claimed" | "claimable" | "pending" | "expired";
  claimPending: boolean;
  claimableFrom: string | null;
  txUrl: string | null;
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="flex items-center gap-2 px-1 text-[10.5px] font-bold uppercase tracking-[0.26em] text-[rgb(214_219_225/.55)]">
        {title}
        {count !== undefined && <span className="bg-[rgb(255_255_255/.06)] px-1.5 py-0.5 text-[9.5px] text-[rgb(214_219_225/.7)]">{count}</span>}
        <span className="h-px flex-1 bg-[rgb(255_255_255/.08)]" />
      </h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** The player's card: rank, rewards to claim, and missions in progress. */
export function ProgressPanel({ viewer, signedIn, onFocusSpace, onPlay }: { viewer: ViewerStats | null; signedIn: boolean; onFocusSpace(spaceId: string): void; onPlay(slug: string, campaign: string): void }) {
  const [items, setItems] = useState<Adventure[] | null>(null);
  const [rewards, setRewards] = useState<{ items: Reward[]; symbol: string; hasWallet: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    api<{ items: Adventure[] }>("/api/me/adventures")
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your missions."));
    api<{ items: Reward[]; symbol: string; hasWallet: boolean }>("/api/me/rewards")
      .then(setRewards)
      .catch(() => setRewards({ items: [], symbol: viewer?.symbol ?? "USDC", hasWallet: false }));
  }, [signedIn, viewer?.symbol]);

  if (!signedIn) {
    return (
      <div className="px-5 pt-4 text-center">
        <div className="bg-[rgb(10_13_18/.6)] px-6 py-8" style={frame(14, `${INK} / .14)`)}>
          <GameIcon name="earn" size={96} className="yv-float mx-auto" />
          <p className="mt-4 text-[13px] font-bold uppercase tracking-[0.16em] text-white">Sign in to keep your loot</p>
          <p className="mt-1 font-sans text-[14px] text-[rgb(214_219_225/.6)]">Your progress and prizes are saved.</p>
          <Link href="/signin?next=/explore?panel=progress" className="mt-5 inline-flex h-11 items-center bg-orange px-6 text-[12px] font-black uppercase tracking-[0.16em] text-[#140c05]" style={plate(10)}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const done = viewer?.missionsCompleted ?? 0;
  const rankIdx = RANKS.reduce((acc, r, i) => (done >= r.at ? i : acc), 0);
  const rank = RANKS[rankIdx]!;
  const next = RANKS[rankIdx + 1];
  const pct = next ? ((done - rank.at) / (next.at - rank.at)) * 100 : 100;
  const toClaim = rewards?.items.filter((r) => r.state === "claimable").length ?? 0;
  const parse = (href: string) => href.match(/^\/s\/([a-z0-9-]+)\/c\/([a-z0-9-]+)$/);

  return (
    <div className="h-full overflow-y-auto px-5 pb-8">
      {/* player card */}
      <div className="relative overflow-hidden bg-[linear-gradient(150deg,rgb(255_145_56/.16),rgb(10_13_18/.7)_55%)] p-4" style={frame(14, "rgb(255 145 56 / .45)")}>
        <div className="flex items-center gap-3">
          <GameIcon name="profile" size={64} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-orange">Rank {rankIdx + 1}</p>
            <p className="truncate font-display text-[19px] font-bold uppercase tracking-[0.04em] text-white">{rank.name}</p>
            <div className="mt-2 h-1.5 overflow-hidden bg-[rgb(214_219_225/.12)]">
              <div className="h-full bg-[linear-gradient(90deg,#FF9138,#FFC24B)] transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-[rgb(214_219_225/.5)]">
              {next ? `${next.at - done} more mission${next.at - done === 1 ? "" : "s"} to ${next.name}` : "Top rank reached"}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="bg-[rgb(255_194_75/.07)] px-3 py-2.5" style={frame(8, "rgb(255 194 75 / .3)")}>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[rgb(255_194_75/.75)]">Treasure claimed</p>
            <p className="mt-0.5 font-display text-[18px] font-bold text-reward">{viewer ? `${viewer.rewardsClaimed} ${viewer.symbol}` : "—"}</p>
          </div>
          <div className="px-3 py-2.5" style={frame(8, `${INK} / .18)`)}>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.55)]">Missions done</p>
            <p className="mt-0.5 font-display text-[18px] font-bold text-white">{viewer ? `${viewer.missionsCompleted} / ${viewer.missionsStarted}` : "—"}</p>
          </div>
        </div>
      </div>

      {/* rewards */}
      <Section title="My rewards" count={rewards?.items.length}>
        {!rewards ? (
          <p className="px-1 text-[11px] uppercase tracking-[0.2em] text-[rgb(214_219_225/.45)]">Opening the vault…</p>
        ) : rewards.items.length === 0 ? (
          <div className="flex items-center gap-3 bg-[rgb(10_13_18/.5)] p-3" style={frame(10, `${INK} / .1)`)}>
            <GameIcon name="earn" size={40} className="opacity-60 grayscale" />
            <p className="font-sans text-[13px] leading-snug text-[rgb(214_219_225/.6)]">No treasure yet. Finish a hunt with a prize to win one.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {toClaim > 0 && (
              <li className="yv-pop bg-[rgb(255_194_75/.12)] px-3 py-2 text-[10.5px] font-black uppercase tracking-[0.2em] text-reward" style={frame(8, "rgb(255 194 75 / .5)")}>
                ★ {toClaim} reward{toClaim === 1 ? "" : "s"} ready to claim
              </li>
            )}
            {!rewards.hasWallet && (
              <li className="px-1 font-sans text-[12.5px] text-gold">
                <Link href="/me/profile" className="underline underline-offset-2">Link a NEAR wallet</Link> to claim your rewards.
              </li>
            )}
            {rewards.items.map((r) => (
              <li key={r.id} className="bg-[rgb(10_13_18/.6)] p-3" style={frame(10, r.state === "claimable" ? "rgb(255 194 75 / .55)" : `${INK} / .12)`)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[9.5px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.5)]">{r.spaceName}</p>
                    <p className="truncate text-[13px] font-bold uppercase tracking-[0.06em] text-white">{r.title}</p>
                  </div>
                  <p className="shrink-0 font-display text-[17px] font-bold text-reward">
                    {r.amount} <span className="text-[11px] text-gold">{rewards.symbol}</span>
                  </p>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  {r.state === "claimed" ? (
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-mint-ink">✓ Claimed</span>
                  ) : r.state === "expired" ? (
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-danger">Expired</span>
                  ) : r.state === "pending" ? (
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky">{r.claimableFrom ? `Claimable from ${new Date(r.claimableFrom).toLocaleDateString()}` : "Finalizing"}</span>
                  ) : (
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-reward">Ready</span>
                  )}
                  {r.state === "claimable" && <ClaimButton allocationId={r.id} pending={r.claimPending} />}
                  {r.txUrl && (
                    <a href={r.txUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange hover:underline">
                      Transaction ↗
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* missions */}
      <Section title="My missions" count={items?.length}>
        {error ? (
          <p className="px-1 text-[13px] text-danger">{error}</p>
        ) : !items ? (
          <p className="px-1 text-[11px] uppercase tracking-[0.2em] text-[rgb(214_219_225/.45)]">Loading…</p>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-3 bg-[rgb(10_13_18/.5)] p-3" style={frame(10, `${INK} / .1)`)}>
            <GameIcon name="explore" size={40} className="opacity-70" />
            <p className="font-sans text-[13px] leading-snug text-[rgb(214_219_225/.6)]">No missions yet. Pick a glowing pin on the map to start.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((a) => {
              const done = /completed|qualified|winner/i.test(a.badge);
              const m = parse(a.href);
              return (
                <li key={a.id} className="bg-[rgb(10_13_18/.6)] p-3" style={frame(10, done ? "rgb(110 231 183 / .35)" : `${INK} / .12)`)}>
                  <div className="flex items-start gap-3">
                    <GameIcon name={done ? "earn" : a.template === "treasure_hunt" ? "explore" : "play"} size={38} className={done ? "" : "opacity-90"} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-[9.5px] font-black uppercase tracking-[0.2em] ${done ? "text-mint-ink" : "text-orange"}`}>{a.badge}</p>
                      <p className="truncate text-[13px] font-bold uppercase tracking-[0.06em] text-white">{a.title}</p>
                      <p className="truncate font-sans text-[12px] text-[rgb(214_219_225/.55)]">
                        {a.spaceName} · {a.progress}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    {m && (
                      <button type="button" onClick={() => onPlay(m[1]!, m[2]!)} className="h-8 bg-orange px-3 text-[10.5px] font-black uppercase tracking-[0.16em] text-[#140c05]" style={plate(7)}>
                        {done ? "View" : "Continue"}
                      </button>
                    )}
                    <button type="button" onClick={() => onFocusSpace(a.spaceId)} className="h-8 px-3 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[rgb(214_219_225/.7)] hover:text-white" style={frame(7, `${INK} / .2)`)}>
                      Show on map
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <div className="mt-6 flex justify-between px-1 text-[10.5px] font-bold uppercase tracking-[0.18em]">
        <Link href="/me/rewards" className="text-reward hover:underline">
          Reward history →
        </Link>
        <Link href="/me/profile" className="text-[rgb(214_219_225/.55)] hover:text-white">
          Wallet & profile
        </Link>
      </div>
    </div>
  );
}
