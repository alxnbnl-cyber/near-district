"use client";

import { useEffect, useState } from "react";
import type { Prize } from "@/world/types";
import { api, ApiError } from "@/lib/api";
import { HuntPlayer } from "@/app/s/[slug]/c/[campaign]/HuntPlayer";
import { ContestEntry } from "@/app/s/[slug]/c/[campaign]/ContestEntry";
import { cutEdges, frame } from "./frame";
import { LiveReward } from "./LiveReward";
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
    otherMissions: { title: string; slug: string; template: string; status: string; endsAt: string | null }[];
    verified: boolean;
    joinedAt: string | null;
    stats: { missions: number; players: number };
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

/** Who's behind the mission: full profile, numbers, links and every open mission. */
function CompanyCard({ space, current, onOpen }: { space: MissionData["space"]; current: MissionData["campaign"]; onOpen?(slug: string, campaign: string): void }) {
  const links = [
    ...(space.websiteUrl && safeUrl(space.websiteUrl) ? [["Website", space.websiteUrl] as const] : []),
    ...Object.entries(space.socials)
      .map(([k, v]) => [SOCIAL_LABEL[k.toLowerCase()] ?? k, v] as const)
      .filter(([, v]) => Boolean(v && safeUrl(v))),
  ];
  const host = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return u;
    }
  };
  const since = space.joinedAt ? new Date(space.joinedAt).toLocaleDateString("en", { month: "short", year: "numeric" }) : "—";
  const missions = [{ title: current.title, slug: current.slug, template: current.template, status: "CURRENT", endsAt: current.endsAt }, ...space.otherMissions];
  const label = "text-[9.5px] font-bold uppercase tracking-[0.24em] text-[rgb(214_219_225/.45)]";
  return (
    <section className="mt-6 grid gap-3 font-mono lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-5">
      <div className="flex min-w-0 flex-col gap-3">
          {/* hero */}
          <div className="relative overflow-hidden bg-[radial-gradient(120%_140%_at_0%_0%,rgb(255_145_56/.22),transparent_55%),linear-gradient(160deg,rgb(16_20_27/.9),rgb(8_10_14/.9))] p-5" style={frame(16, "rgb(255 145 56 / .35)")}>
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-44 rounded-full border border-[rgb(255_145_56/.15)]" />
            <span aria-hidden className="pointer-events-none absolute -right-2 -top-2 size-28 rounded-full border border-dashed border-[rgb(255_145_56/.2)]" />
            <div className="relative flex items-center gap-4">
              <span className="relative size-[84px] shrink-0 overflow-hidden bg-[rgb(255_255_255/.05)] shadow-[0_0_30px_rgb(255_145_56/.25)]" style={frame(14, "rgb(255 145 56 / .55)", 1.5)}>
                {space.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={space.logoUrl} alt="" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center font-display text-[38px] font-bold text-orange">{space.name[0]?.toUpperCase()}</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-orange">Mission host</p>
                <h2 className="mt-1 flex flex-wrap items-center gap-2 font-display text-[26px] font-bold uppercase leading-none tracking-[0.02em] text-white">
                  {space.name}
                  {space.verified && (
                    <span className="inline-flex items-center gap-1 bg-[rgb(77_224_170/.12)] px-2 py-1 text-[9.5px] font-bold tracking-[0.18em] text-mint-ink" style={frame(5, "rgb(77 224 170 / .4)")}>
                      ✓ Verified
                    </span>
                  )}
                </h2>
                {space.tagline && <p className="mt-1.5 font-sans text-[15px] leading-snug text-[rgb(214_219_225/.8)]">{space.tagline}</p>}
                <span className="mt-2 inline-block bg-[rgb(255_255_255/.06)] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-[rgb(214_219_225/.7)]">{space.category}</span>
              </div>
            </div>
          </div>

          {/* about */}
          <div className="bg-[rgb(10_13_18/.6)] px-4 py-4" style={frame(12, `${INK} / .12)`)}>
            <p className={label}>About</p>
            <p className="mt-2 whitespace-pre-line font-sans text-[14.5px] leading-relaxed text-[rgb(214_219_225/.8)]">
              {space.description?.trim() || space.tagline || `${space.name} hosts missions on NEAR District.`}
            </p>
          </div>

          {/* links */}
          {links.length > 0 && (
            <div className="bg-[rgb(10_13_18/.6)] px-4 py-4" style={frame(12, `${INK} / .12)`)}>
              <p className={label}>Links</p>
              <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                {links.map(([name, url]) => (
                  <a
                    key={name}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="group flex items-center justify-between gap-3 bg-[rgb(255_255_255/.03)] px-3 py-2.5 transition-colors hover:bg-[rgb(255_145_56/.1)]"
                    style={frame(7, `${INK} / .14)`)}
                  >
                    <span className="min-w-0">
                      <span className="block text-[10.5px] font-bold uppercase tracking-[0.16em] text-white">{name}</span>
                      <span className="block truncate font-sans text-[12px] text-[rgb(214_219_225/.55)]">{host(url)}</span>
                    </span>
                    <span className="shrink-0 text-orange transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5">↗</span>
                  </a>
                ))}
              </div>
              <p className="mt-2.5 font-sans text-[11.5px] text-[rgb(214_219_225/.4)]">Links are provided by the company. NEAR District doesn't vouch for them.</p>
            </div>
          )}

      </div>
      <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
          {/* numbers */}
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["Open missions", String(space.stats.missions), "text-orange"],
                ["Players", space.stats.players.toLocaleString("en"), "text-sky"],
                ["Host since", since, "text-reward"],
              ] as const
            ).map(([k, v, cls]) => (
              <div key={k} className="bg-[rgb(10_13_18/.6)] px-3 py-3" style={frame(10, `${INK} / .12)`)}>
                <p className={label}>{k}</p>
                <p className={`mt-1 font-display text-[20px] font-bold leading-none tabular-nums ${cls}`}>{v}</p>
              </div>
            ))}
          </div>

          {/* missions */}
          <div className="bg-[rgb(10_13_18/.6)] px-4 py-4" style={frame(12, `${INK} / .12)`)}>
            <p className={label}>Missions by {space.name}</p>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {missions.map((m) => {
                const here = m.status === "CURRENT";
                const hunt = m.template === "treasure_hunt";
                const body = (
                  <>
                    <GameIcon name={hunt ? "explore" : "play"} size={30} className={here ? "" : "opacity-80"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-bold uppercase tracking-[0.08em] text-white">{m.title}</span>
                      <span className="block text-[10px] uppercase tracking-[0.16em] text-[rgb(214_219_225/.5)]">
                        {hunt ? "Treasure hunt" : "Creative challenge"}
                        {m.status === "SCHEDULED" ? " · coming soon" : m.endsAt ? ` · ${timeLeft(m.endsAt)}` : ""}
                      </span>
                    </span>
                    {here ? (
                      <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-[0.2em] text-orange">Viewing</span>
                    ) : (
                      <span className="shrink-0 text-orange transition-transform group-hover:translate-x-0.5">→</span>
                    )}
                  </>
                );
                return (
                  <li key={m.slug}>
                    {here ? (
                      <div className="flex items-center gap-3 bg-[rgb(255_145_56/.08)] px-3 py-2" style={frame(8, "rgb(255 145 56 / .35)")}>{body}</div>
                    ) : (
                      <button type="button" onClick={() => onOpen?.(space.slug, m.slug)} className="group flex w-full items-center gap-3 bg-[rgb(255_255_255/.03)] px-3 py-2 text-left transition-colors hover:bg-[rgb(255_145_56/.1)]" style={frame(8, `${INK} / .12)`)}>
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
      </div>
    </section>
  );
}

/** The prize pool: big, live, and clear about where it comes from. */
function PrizePool({ data }: { data: MissionData }) {
  const funded = data.rules.funded && data.prize;
  const hunt = data.campaign.template === "treasure_hunt";
  return (
    <section className="relative overflow-hidden bg-[linear-gradient(150deg,rgb(255_194_75/.16),rgb(8_11_16/.88)_55%)] p-5 font-mono md:p-6" style={frame(16, "rgb(255 194 75 / .55)", 1, { shadow: "0 0 40px rgb(255 194 75 / .14)" })}>
      <span aria-hidden className="yv-pp-rays pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-[conic-gradient(from_0deg,transparent,rgb(255_194_75/.16),transparent_20%,rgb(255_145_56/.12),transparent_45%,rgb(255_194_75/.14),transparent_70%)]" />
      <div className="relative flex flex-wrap items-center gap-5">
        <GameIcon name="earn" size={80} className="yv-float shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.28em] text-reward">
            Prize pool
          </p>
          {funded ? (
            <>
              <LiveReward prize={data.prize!} className="mt-1 block font-display text-[40px] font-bold leading-none text-reward md:text-[48px]" />
              <p className="mt-2.5 text-[11px] font-bold uppercase leading-relaxed tracking-[0.14em] text-[rgb(214_219_225/.75)]">
                🏆 {hunt ? "Split equally by everyone who solves it" : `${data.rules.winnersCount} winner${data.rules.winnersCount === 1 ? "" : "s"} picked by ${data.space.name}`}
              </p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[rgb(214_219_225/.55)]">👥 {data.participants} playing</p>
            </>
          ) : (
            <>
              <p className="mt-1 font-display text-[34px] font-bold uppercase text-white">Glory</p>
              <p className="font-sans text-[13px] text-[rgb(214_219_225/.6)]">Just for fun. No token prize.</p>
            </>
          )}
        </div>
      </div>
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

          <div className="mx-auto w-full max-w-[1320px] px-5 pb-12 pt-8 md:px-10 xl:px-14">
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
                  {data.campaign.summary && <p className="mt-3 max-w-3xl font-sans text-[16px] leading-relaxed text-[rgb(214_219_225/.75)]">{data.campaign.summary}</p>}
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
                  <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                    {/* main: timeline, play, story */}
                    <div className="flex min-w-0 flex-col gap-5">
                      <MissionTimeline startsAt={data.campaign.startsAt} endsAt={data.campaign.endsAt} claimDays={data.rules.claimWindowDays} funded={data.rules.funded} />
                      <section>
                        {hunt ? (
                          <HuntPlayer campaignId={data.campaign.id} status={data.status} signedIn={data.signedIn} returnTo={returnTo} />
                        ) : (
                          <ContestEntry campaignId={data.campaign.id} status={data.status} signedIn={data.signedIn} returnTo={returnTo} />
                        )}
                      </section>
                      {data.campaign.description && (
                        <section className="bg-[rgb(10_13_18/.6)] px-5 py-4 font-mono" style={frame(12, `${INK} / .12)`)}>
                          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-orange">The story</p>
                          <p className="mt-2 whitespace-pre-line font-sans text-[15px] leading-relaxed text-[rgb(214_219_225/.78)]">{data.campaign.description}</p>
                        </section>
                      )}
                    </div>

                    {/* side: prize, host, rules */}
                    <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
                      <PrizePool data={data} />
                      <button
                        type="button"
                        onClick={() => setTab("company")}
                        className="group flex items-center gap-3 bg-[rgb(10_13_18/.6)] p-3 text-left font-mono transition-colors hover:bg-[rgb(255_145_56/.08)]"
                        style={frame(12, `${INK} / .14)`)}
                      >
                        <span className="relative size-12 shrink-0 overflow-hidden bg-[rgb(255_255_255/.05)]" style={frame(8, "rgb(255 145 56 / .4)")}>
                          {data.space.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={data.space.logoUrl} alt="" className="absolute inset-0 size-full object-cover" />
                          ) : (
                            <span className="grid size-full place-items-center font-display text-[20px] font-bold text-orange">{data.space.name[0]?.toUpperCase()}</span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[9.5px] font-bold uppercase tracking-[0.24em] text-[rgb(214_219_225/.45)]">Hosted by</span>
                          <span className="block truncate text-[14px] font-bold uppercase tracking-[0.06em] text-white">
                            {data.space.name} {data.space.verified && <span className="text-mint-ink">✓</span>}
                          </span>
                          {data.space.tagline && <span className="block truncate font-sans text-[12.5px] text-[rgb(214_219_225/.6)]">{data.space.tagline}</span>}
                        </span>
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-orange transition-transform group-hover:translate-x-0.5">Profile →</span>
                      </button>
                      <section className="bg-[rgb(10_13_18/.6)] px-4 py-4 font-mono" style={frame(12, `${INK} / .12)`)}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[rgb(214_219_225/.55)]">Rules</p>
                        <ul className="mt-2.5 space-y-2 font-sans text-[13.5px] leading-snug text-[rgb(214_219_225/.75)]">
                          <li className="flex gap-2"><span className="text-orange">◆</span>Free to play. One entry per person.</li>
                          {hunt && <li className="flex gap-2"><span className="text-orange">◆</span>Answers are sealed: change them any time until the deadline. Results are revealed when the mission ends.</li>}
                          {data.rules.funded && (
                            <li className="flex gap-2">
                              <span className="text-orange">◆</span>
                              {hunt ? "Everyone who answers every clue correctly splits the prize equally." : `${data.space.name} picks up to ${data.rules.winnersCount} winners, who split the prize equally.`}
                            </li>
                          )}
                          {data.rules.funded && <li className="flex gap-2"><span className="text-orange">◆</span>Prizes are paid in {data.symbol} to the NEAR wallet you sign in with.</li>}
                          <li className="flex gap-2"><span className="text-orange">◆</span>Answers are checked on our servers; bots are disqualified.</li>
                        </ul>
                      </section>
                    </aside>
                  </div>
                ) : (
                  <CompanyCard space={data.space} current={data.campaign} onOpen={onOpen} />
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
