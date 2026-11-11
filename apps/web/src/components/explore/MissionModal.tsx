"use client";

import { useEffect, useState } from "react";
import type { Prize } from "@/world/types";
import { api, ApiError } from "@/lib/api";
import { HuntPlayer } from "@/app/s/[slug]/c/[campaign]/HuntPlayer";
import { ContestEntry } from "@/app/s/[slug]/c/[campaign]/ContestEntry";
import { cutEdges, frame } from "./frame";
import { LiveReward, formatRate, rewardRate } from "./LiveReward";
import { GameIcon } from "@/components/host/GameIcon";
import { FIXED_REWARDS_ENABLED } from "@/lib/features";

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


/** The prize pool: big, live, and clear about where it comes from. */
function PrizePool({ data, rate }: { data: MissionData; rate: number | null }) {
  const funded = data.rules.funded && data.prize;
  const growing = funded && rate !== null;
  return (
    <section className="relative overflow-hidden bg-[linear-gradient(150deg,rgb(255_194_75/.16),rgb(8_11_16/.88)_55%)] p-5 font-mono md:p-6" style={frame(16, "rgb(255 194 75 / .55)", 1, { shadow: "0 0 40px rgb(255 194 75 / .14)" })}>
      <span aria-hidden className="yv-pp-rays pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-[conic-gradient(from_0deg,transparent,rgb(255_194_75/.16),transparent_20%,rgb(255_145_56/.12),transparent_45%,rgb(255_194_75/.14),transparent_70%)]" />
      <div className="relative flex flex-wrap items-center gap-5">
        <GameIcon name="earn" size={92} className="yv-float shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.28em] text-reward">
            Prize pool
            {funded && (growing || FIXED_REWARDS_ENABLED) && (
              <span className={`px-2 py-0.5 text-[9.5px] tracking-[0.18em] ${growing ? "bg-[rgb(52_211_153/.14)] text-mint-ink" : "bg-[rgb(255_255_255/.06)] text-[rgb(214_219_225/.75)]"}`}>
                {growing ? "▲ Growing · yield funded" : "Fixed reward"}
              </span>
            )}
          </p>
          {funded ? (
            <>
              <LiveReward prize={data.prize!} className="mt-1 block font-display text-[40px] font-bold leading-none text-reward md:text-[48px]" tailClassName="text-[22px] opacity-50" />
              <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[rgb(214_219_225/.7)]">
                {growing ? <span className="text-mint-ink">{formatRate(rate!, data.prize!.symbol)} · </span> : null}
                🏆 {data.rules.winnersCount} winner{data.rules.winnersCount === 1 ? "" : "s"}
                {data.rules.equalShare ? " · equal share" : ""} · 👥 {data.participants} playing
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 font-display text-[34px] font-bold uppercase text-white">Glory</p>
              <p className="font-sans text-[13px] text-[rgb(214_219_225/.6)]">Just for fun. No token prize.</p>
            </>
          )}
        </div>
      </div>
      {growing && (
        <p className="relative mt-4 border-t border-dashed border-[rgb(255_194_75/.25)] pt-3 font-sans text-[13px] text-[rgb(214_219_225/.7)]">
          {data.space.name} deposited funds that earn interest on RHEA Lending. Every second, that interest grows this pool; their deposit stays theirs.
        </p>
      )}
      <style>{`@keyframes yv-pp-rot { to { transform: rotate(360deg) } } .yv-pp-rays { animation: yv-pp-rot 22s linear infinite } @media (prefers-reduced-motion: reduce) { .yv-pp-rays { animation: none } }`}</style>
    </section>
  );
}

/** Starts → answers lock → results → rewards paid, with the current stage lit. */
function MissionTimeline({ startsAt, endsAt, claimDays, funded }: { startsAt: string | null; endsAt: string | null; claimDays: number; funded: boolean }) {
  const now = Date.now();
  const end = endsAt ? Date.parse(endsAt) : null;
  const fmt = (t: number | null) => (t ? new Date(t).toLocaleDateString("en", { month: "short", day: "numeric" }) : "—");
  const steps = [
    { label: "Starts", at: startsAt ? Date.parse(startsAt) : null },
    { label: "Answers lock", at: end },
    { label: "Results revealed", at: end },
    ...(funded ? [{ label: "Rewards paid", at: end ? end + 3_600_000 : null, note: `claim within ${claimDays}d` }] : []),
  ];
  const current = steps.findIndex((st) => st.at === null || st.at > now);
  return (
    <section className="bg-[rgb(10_13_18/.6)] px-4 py-4 font-mono" style={frame(12, `${INK} / .12)`)}>
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[rgb(214_219_225/.5)]">
        Timeline {end && end > now ? <span className="text-orange">· deadline in {timeLeft(endsAt)}</span> : null}
      </p>
      <ol className="mt-3 grid gap-3" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((st, i) => {
          const done = current === -1 || i < current;
          const now_ = i === current;
          return (
            <li key={st.label} className="relative">
              <span className={`block h-1 ${done ? "bg-orange" : now_ ? "bg-[linear-gradient(90deg,#FF9138,rgb(214_219_225/.15))]" : "bg-[rgb(214_219_225/.12)]"}`} />
              <span className={`mt-2 block text-[10.5px] font-bold uppercase tracking-[0.14em] ${done || now_ ? "text-white" : "text-[rgb(214_219_225/.45)]"}`}>{st.label}</span>
              <span className="block text-[10px] uppercase tracking-[0.12em] text-[rgb(214_219_225/.5)]">{fmt(st.at)}{"note" in st && st.note ? ` · ${st.note}` : ""}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** A mission, played right on top of the map. */
export function MissionModal({ slug, campaign, onClose, onOpen }: { slug: string; campaign: string; onClose(): void; onOpen?(slug: string, campaign: string): void }) {
  const [data, setData] = useState<MissionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"mission" | "company">("mission");

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
                {/* header: who and what */}
                <section className="yv-enter font-mono">
                  <div className="flex items-center gap-3">
                    <span className="relative size-14 shrink-0 overflow-hidden bg-[rgb(255_255_255/.05)] shadow-[inset_0_0_0_1px_rgb(255_255_255/.12)]">
                      {data.space.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={data.space.logoUrl} alt="" className="absolute inset-0 size-full object-cover" />
                      ) : (
                        <span className="grid size-full place-items-center font-display text-[22px] font-bold text-orange">{data.space.name[0]?.toUpperCase()}</span>
                      )}
                    </span>
                    <span>
                      <span className="block text-[10.5px] font-bold uppercase tracking-[0.24em] text-orange">{hunt ? "Treasure hunt" : "Creative challenge"} · by {data.space.name}</span>
                      <h1 className="font-display text-[30px] font-bold uppercase leading-[1.05] tracking-[0.01em] text-white md:text-[40px]">{data.campaign.title}</h1>
                    </span>
                  </div>
                  {data.campaign.summary && <p className="mt-3 max-w-2xl font-sans text-[16px] leading-relaxed text-[rgb(214_219_225/.75)]">{data.campaign.summary}</p>}
                </section>

                {/* tabs */}
                <div role="tablist" aria-label="Mission sections" className="mt-6 flex gap-2 border-b border-[rgb(255_255_255/.08)] font-mono">
                  {(["mission", "company"] as const).map((t) => (
                    <button
                      key={t}
                      role="tab"
                      type="button"
                      aria-selected={tab === t}
                      onClick={() => setTab(t)}
                      className={`-mb-px flex items-center gap-2 px-4 py-3 text-[12px] font-bold uppercase tracking-[0.2em] transition-colors ${tab === t ? "border-b-2 border-orange text-orange" : "border-b-2 border-transparent text-[rgb(214_219_225/.55)] hover:text-white"}`}
                    >
                      <GameIcon name={t === "mission" ? (hunt ? "explore" : "play") : "profile"} size={22} className={tab === t ? "" : "opacity-60 grayscale"} />
                      {t === "mission" ? "Mission" : "Company"}
                    </button>
                  ))}
                </div>

                {tab === "mission" ? (
                  <div className="mt-6 flex flex-col gap-5">
                    <PrizePool data={data} rate={rate} />
                    <MissionTimeline startsAt={data.campaign.startsAt} endsAt={data.campaign.endsAt} claimDays={data.rules.claimWindowDays} funded={data.rules.funded} />
                    <section>
                      {hunt ? (
                        <HuntPlayer campaignId={data.campaign.id} status={data.status} signedIn={data.signedIn} returnTo={returnTo} />
                      ) : (
                        <ContestEntry campaignId={data.campaign.id} status={data.status} signedIn={data.signedIn} returnTo={returnTo} />
                      )}
                    </section>
                    <section className="grid gap-3 font-mono md:grid-cols-2">
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
                          {hunt && <li>• Answers are sealed: you can change them until the deadline; results are revealed when the mission ends.</li>}
                          {data.rules.funded && <li>• Winners are picked by the published rules after the mission ends and paid straight to their wallet.</li>}
                          {data.rules.funded && <li>• You need a NEAR wallet to receive {data.symbol}, or choose cash out when you win.</li>}
                          <li>• Answers are checked on our servers; bots are disqualified.</li>
                        </ul>
                      </details>
                    </section>
                  </div>
                ) : (
                  <CompanyCard space={data.space} onOpen={onOpen} />
                )}
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
