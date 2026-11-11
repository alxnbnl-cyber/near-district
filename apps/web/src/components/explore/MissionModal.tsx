"use client";

import { useEffect, useState } from "react";
import type { Prize } from "@/world/types";
import { api, ApiError } from "@/lib/api";
import { HuntPlayer } from "@/app/s/[slug]/c/[campaign]/HuntPlayer";
import { ContestEntry } from "@/app/s/[slug]/c/[campaign]/ContestEntry";
import { cutEdges, frame } from "./frame";
import { LiveReward, formatRate, rewardRate } from "./LiveReward";
import { GameIcon } from "@/components/host/GameIcon";

interface MissionData {
  campaign: { id: string; slug: string; title: string; summary: string | null; description: string | null; template: string; startsAt: string | null; endsAt: string | null };
  space: {
    name: string;
    slug: string;
    logoUrl: string | null;
    tagline: string | null;
    description: string | null;
    category: string;
    websiteUrl: string | null;
    socials: Record<string, string>;
    otherMissions: { title: string; slug: string; template: string; status: string }[];
  };
  rules: { funded: boolean; winnersCount: number; equalShare: boolean; claimWindowDays: number; judgingCriteria: { key: string; label: string; weightBps: number }[] | null };
  participants: number;
  status: string;
  prize: Prize | null;
  symbol: string;
  signedIn: boolean;
}

const INK = "rgb(214 219 225";
/** Big cut corners: the map shows through them, so the modal still feels part of the world. */
const CUT = 34;
const SHELL = `polygon(${CUT}px 0, calc(100% - ${CUT}px) 0, 100% ${CUT}px, 100% calc(100% - ${CUT}px), calc(100% - ${CUT}px) 100%, ${CUT}px 100%, 0 calc(100% - ${CUT}px), 0 ${CUT}px)`;

function timeLeft(iso: string | null) {
  if (!iso) return null;
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "Ended";
  const d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d > 0 ? `${d}d ${h}h left` : `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m left`;
}

const SOCIAL_LABEL: Record<string, string> = { x: "X", twitter: "X", telegram: "Telegram", discord: "Discord", github: "GitHub", medium: "Medium", youtube: "YouTube", linkedin: "LinkedIn" };

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null);

/** Who's behind the mission: logo, pitch, links and their other missions. */
function CompanyCard({ space, onOpen }: { space: MissionData["space"]; onOpen?(slug: string, campaign: string): void }) {
  const links = [
    ...(space.websiteUrl && safeUrl(space.websiteUrl) ? [["Website", space.websiteUrl] as const] : []),
    ...Object.entries(space.socials)
      .map(([k, v]) => [SOCIAL_LABEL[k.toLowerCase()] ?? k, v] as const)
      .filter(([, v]) => Boolean(v && safeUrl(v))),
  ];
  return (
    <section className="mt-6 overflow-hidden bg-[rgb(10_13_18/.6)] font-mono" style={frame(14, `${INK} / .14)`)}>
      <div className="flex items-stretch">
        <span className="relative w-[96px] shrink-0 overflow-hidden border-r border-[rgb(255_255_255/.08)] bg-[rgb(255_255_255/.04)]">
          {space.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={space.logoUrl} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center font-display text-[34px] font-bold text-orange">{space.name[0]?.toUpperCase()}</span>
          )}
        </span>
        <div className="min-w-0 flex-1 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-orange">About the company</p>
          <h2 className="mt-1 font-display text-[22px] font-bold uppercase leading-tight tracking-[0.02em] text-white">{space.name}</h2>
          {space.tagline && <p className="mt-0.5 font-sans text-[14px] text-[rgb(214_219_225/.7)]">{space.tagline}</p>}
          <span className="mt-2 inline-block bg-[rgb(255_255_255/.05)] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-[rgb(214_219_225/.6)]">{space.category}</span>
        </div>
      </div>
      {space.description && <p className="border-t border-[rgb(255_255_255/.06)] px-4 py-3 font-sans text-[14px] leading-relaxed text-[rgb(214_219_225/.72)]">{space.description}</p>}
      {(links.length > 0 || space.otherMissions.length > 0) && (
        <div className="grid gap-4 border-t border-[rgb(255_255_255/.06)] px-4 py-3 md:grid-cols-2">
          {links.length > 0 && (
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.45)]">Links</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {links.map(([label, url]) => (
                  <a key={label} href={url} target="_blank" rel="noopener noreferrer nofollow" className="px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[rgb(214_219_225/.8)] hover:text-orange" style={frame(6, `${INK} / .2)`)}>
                    {label} ↗
                  </a>
                ))}
              </div>
            </div>
          )}
          {space.otherMissions.length > 0 && (
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.45)]">More missions</p>
              <ul className="mt-2 flex flex-col gap-1">
                {space.otherMissions.map((m) => (
                  <li key={m.slug}>
                    <button
                      type="button"
                      onClick={() => onOpen?.(space.slug, m.slug)}
                      className="group flex w-full items-center justify-between gap-2 bg-[rgb(255_255_255/.03)] px-3 py-2 text-left text-[11.5px] font-bold uppercase tracking-[0.08em] text-white hover:bg-[rgb(255_145_56/.1)]"
                    >
                      <span className="truncate">{m.title}</span>
                      <span className="shrink-0 text-orange transition-transform group-hover:translate-x-0.5">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** A mission, played right on top of the map. */
export function MissionModal({ slug, campaign, onClose, onOpen }: { slug: string; campaign: string; onClose(): void; onOpen?(slug: string, campaign: string): void }) {
  const [data, setData] = useState<MissionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    api<MissionData>(`/api/missions/${encodeURIComponent(slug)}/${encodeURIComponent(campaign)}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : "Couldn't open this mission."));
    return () => {
      alive = false;
    };
  }, [slug, campaign]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hunt = data?.campaign.template === "treasure_hunt";
  const returnTo = `/explore?m=${encodeURIComponent(`${slug}/${campaign}`)}`;
  const rate = data?.prize ? rewardRate(data.prize).perDay : null;

  return (
    <div className="fixed inset-0 z-[65]" role="dialog" aria-modal="true" aria-label={data?.campaign.title ?? "Mission"}>
      <div className="yv-mm-fade absolute inset-0 bg-[rgb(0_0_0/.45)] backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="yv-mm absolute inset-2 overflow-hidden bg-[rgb(5_7_10/.9)] backdrop-blur-xl sm:inset-5 md:inset-8"
        style={{ clipPath: SHELL }}
      >
        {/* outline that follows the cut corners */}
        <span aria-hidden className="pointer-events-none absolute inset-0 z-10" style={{ boxShadow: `inset 0 0 0 1px ${INK} / .16)`, ...cutEdges(CUT, "rgb(255 145 56 / .7)", 1, ["tl", "tr", "br", "bl"]) }} />

        <div className="relative h-full overflow-y-auto overscroll-contain">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close mission"
            className="sticky top-0 z-20 float-right m-4 flex h-10 items-center gap-2 bg-[rgb(5_7_10/.8)] px-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.75)] backdrop-blur hover:text-white"
            style={frame(9, `${INK} / .22)`)}
          >
            Back to map <span aria-hidden className="text-[14px]">✕</span>
          </button>

          <div className="mx-auto max-w-4xl px-5 pb-12 pt-8 md:px-10">
            {error ? (
              <p className="mt-20 text-center font-mono text-[13px] uppercase tracking-[0.2em] text-danger">{error}</p>
            ) : !data ? (
              <p className="mt-20 text-center font-mono text-[12px] uppercase tracking-[0.3em] text-[rgb(214_219_225/.5)]">Unrolling the map…</p>
            ) : (
              <>
                {/* header: who, what, and the treasure */}
                <section className="yv-enter grid items-start gap-6 md:grid-cols-[1fr_300px]">
                  <div className="font-mono">
                    <div className="flex items-center gap-3">
                      <span className="relative size-12 shrink-0 overflow-hidden bg-[rgb(255_255_255/.05)] shadow-[inset_0_0_0_1px_rgb(255_255_255/.12)]">
                        {data.space.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={data.space.logoUrl} alt="" className="absolute inset-0 size-full object-cover" />
                        ) : (
                          <span className="grid size-full place-items-center font-display text-[20px] font-bold text-orange">{data.space.name[0]?.toUpperCase()}</span>
                        )}
                      </span>
                      <span>
                        <span className="block text-[10.5px] font-bold uppercase tracking-[0.24em] text-orange">{hunt ? "Treasure hunt" : "Creative challenge"}</span>
                        <span className="block text-[12px] font-bold uppercase tracking-[0.14em] text-[rgb(214_219_225/.6)]">by {data.space.name}</span>
                      </span>
                    </div>
                    <h1 className="mt-4 font-display text-[34px] font-bold uppercase leading-[1.05] tracking-[0.01em] text-white md:text-[44px]">{data.campaign.title}</h1>
                    {data.campaign.summary && <p className="mt-3 max-w-xl font-sans text-[16px] leading-relaxed text-[rgb(214_219_225/.75)]">{data.campaign.summary}</p>}
                    <div className="mt-4 flex flex-wrap gap-2 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[rgb(214_219_225/.7)]">
                      <span className="bg-[rgb(255_255_255/.05)] px-2.5 py-1.5">👥 {data.participants} explorer{data.participants === 1 ? "" : "s"}</span>
                      {timeLeft(data.campaign.endsAt) && <span className="bg-[rgb(255_255_255/.05)] px-2.5 py-1.5">⏱ {timeLeft(data.campaign.endsAt)}</span>}
                    </div>
                  </div>

                  <div className="relative overflow-hidden bg-[linear-gradient(160deg,rgb(255_194_75/.14),rgb(8_11_16/.85)_65%)] p-5 font-mono" style={frame(14, "rgb(255 194 75 / .5)", 1, { shadow: "0 0 30px rgb(255 194 75 / .12)" })}>
                    <GameIcon name="earn" size={86} className="yv-float pointer-events-none absolute -right-3 -top-2 opacity-90" />
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-reward">The treasure</p>
                    {data.rules.funded && data.prize ? (
                      <>
                        <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[rgb(214_219_225/.55)]">Up to</p>
                        <LiveReward prize={data.prize} className="block font-display text-[32px] font-bold leading-none text-reward" tailClassName="text-[18px] opacity-50" />
                        {rate !== null && <p className="mt-1.5 text-[11px] font-bold text-mint-ink">{formatRate(rate, data.prize.symbol)} and growing</p>}
                        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[rgb(214_219_225/.7)]">
                          🏆 {data.rules.winnersCount} winner{data.rules.winnersCount === 1 ? "" : "s"}
                          {data.rules.equalShare ? " · equal share" : ""}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-2 font-display text-[28px] font-bold uppercase text-white">Glory</p>
                        <p className="mt-1 max-w-[65%] font-sans text-[13px] text-[rgb(214_219_225/.6)]">Just for fun. No token prize.</p>
                      </>
                    )}
                  </div>
                </section>

                <section className="mt-8">
                  {hunt ? (
                    <HuntPlayer campaignId={data.campaign.id} status={data.status} signedIn={data.signedIn} returnTo={returnTo} />
                  ) : (
                    <ContestEntry campaignId={data.campaign.id} status={data.status} signedIn={data.signedIn} returnTo={returnTo} />
                  )}
                </section>

                <CompanyCard space={data.space} onOpen={onOpen} />

                <section className="mt-6 grid gap-3 font-mono md:grid-cols-2">
                  {data.campaign.description && (
                    <details className="bg-[rgb(10_13_18/.6)] px-4 py-3" style={frame(10, `${INK} / .12)`)}>
                      <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.8)]">The story</summary>
                      <p className="mt-2 whitespace-pre-line font-sans text-[14px] leading-relaxed text-[rgb(214_219_225/.7)]">{data.campaign.description}</p>
                    </details>
                  )}
                  <details className="bg-[rgb(10_13_18/.6)] px-4 py-3" style={frame(10, `${INK} / .12)`)}>
                    <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.8)]">Rules</summary>
                    <ul className="mt-2 space-y-1.5 font-sans text-[13px] text-[rgb(214_219_225/.7)]">
                      <li>• Free to play. One entry per person.</li>
                      {data.rules.funded && <li>• Winners are picked by the published rules after the mission ends; prizes can be claimed for {data.rules.claimWindowDays} days.</li>}
                      {data.rules.funded && <li>• You need a verified NEAR wallet to receive a prize ({data.symbol}).</li>}
                      <li>• Answers are checked on our servers; bots are disqualified.</li>
                    </ul>
                  </details>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes yv-mm-in { 0% { opacity: 0; transform: scale(.18); filter: blur(10px) brightness(2) } 55% { opacity: 1; filter: blur(0) brightness(1.2) } 100% { opacity: 1; transform: none; filter: none } }
        .yv-mm { animation: yv-mm-in 520ms cubic-bezier(.2,.9,.2,1) both; transform-origin: 50% 50% }
        @keyframes yv-mm-fade { from { opacity: 0 } to { opacity: 1 } }
        .yv-mm-fade { animation: yv-mm-fade 260ms ease-out both }
        @media (prefers-reduced-motion: reduce) { .yv-mm, .yv-mm-fade { animation: none } }
      `}</style>
    </div>
  );
}
