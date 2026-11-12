"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { HintCard } from "@/components/campaign/HintCards";
import { DecryptStyles, LockGrid, SecretConsole, useActiveLock } from "./DecryptGame";
import { Burst } from "@/components/art/Burst";
import { GameIcon } from "@/components/host/GameIcon";
import { frame, plate } from "@/components/explore/frame";

interface Question {
  id: string;
  index: number;
  type: "short_text" | "multiple_choice" | "numeric";
  prompt: string;
  clue: string | null;
  options: { id: string; label: string }[] | null;
  imageUrl: string | null;
  referenceUrl: string | null;
  difficulty: number;
  saved: string | null;
  savedAt: string | null;
  result: { correct: boolean; reveal: string | null } | null;
  hints: HintCard[];
}
interface Timeline {
  startsAt: string | null;
  endsAt: string | null;
  closed: boolean;
}
type PlayState =
  | { status: string; joined: false; total: number; timeline: Timeline }
  | {
      status: string;
      joined: true;
      total: number;
      answered: number;
      timeline: Timeline;
      entryStatus: string;
      score: number | null;
      correctCount: number | null;
      qualification: "qualified" | "held" | "revoked" | "not_qualified" | null;
      questions: Question[];
    };

const INK = "rgb(214 219 225";
const pad = (n: number) => String(n).padStart(2, "0");
const bigBtn =
  "inline-flex h-12 items-center justify-center gap-2 bg-[linear-gradient(180deg,#ffa458,#ff8a2a)] px-6 font-mono text-[12.5px] font-black uppercase tracking-[0.18em] text-[#140c05] shadow-[0_0_24px_rgb(255_145_56/.35)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_0_36px_rgb(255_145_56/.6)] disabled:opacity-50";

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function left(iso: string | null, now: number) {
  if (!iso) return null;
  const ms = Date.parse(iso) - now;
  if (ms <= 0) return "0s";
  const d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

function Panel({ children, tone = `${INK} / .14)`, className = "" }: { children: React.ReactNode; tone?: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[rgb(8_11_16/.82)] p-5 backdrop-blur-xl md:p-6 ${className}`} style={frame(16, tone)}>
      {children}
    </div>
  );
}

/**
 * `onPartnerJump`: called when the player moves to a secret whose hint belongs to a different
 * company (a partner, or back to the host). Names are partner names; null means the mission's host.
 */
export function HuntPlayer({ campaignId, status, signedIn, returnTo, onPartnerJump }: { campaignId: string; status: string; signedIn: boolean; returnTo: string; onPartnerJump?: (from: string | null, to: string | null) => void }) {
  const [state, setState] = useState<PlayState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const now = useNow();
  const [active, setActiveRaw] = useActiveLock(state && state.joined ? state.questions : null);
  const partnerOf = (i: number) => {
    if (!state || !state.joined) return null;
    const req = state.questions[i]?.hints.flatMap((h) => h.requirements).find((r) => r.contract?.partner);
    return req?.contract?.partner?.name ?? null;
  };
  const setActive = (i: number) => {
    if (i === active) return;
    const from = partnerOf(active), to = partnerOf(i);
    if (from !== to) onPartnerJump?.(from, to);
    setActiveRaw(i);
  };

  const load = useCallback(async () => {
    try {
      setState(await api<PlayState>(`/api/campaigns/${campaignId}/play`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load your progress.");
    }
  }, [campaignId]);

  useEffect(() => {
    if (signedIn) void load();
  }, [signedIn, load]);

  // coming back from a partner's activity: refresh hints
  useEffect(() => {
    if (!signedIn) return;
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [signedIn, load]);

  // when the deadline passes while the player is watching, reload to reveal results
  const endsAt = state?.timeline.endsAt ?? null;
  const closed = state?.timeline.closed ?? false;
  useEffect(() => {
    if (!endsAt || closed) return;
    const ms = Date.parse(endsAt) - Date.now();
    if (ms <= 0 || ms > 2 ** 31 - 1) return;
    const t = setTimeout(() => void load(), ms + 1500);
    return () => clearTimeout(t);
  }, [endsAt, closed, load]);

  const styles = (
    <>
    <DecryptStyles />
    <style>{`
      @keyframes yv-stamp { 0% { opacity: 0; transform: scale(1.8) rotate(-12deg) } 40% { opacity: 1; transform: scale(.95) rotate(-6deg) } 100% { opacity: 1; transform: scale(1) rotate(-6deg) } }
      .yv-stamp { animation: yv-stamp 420ms cubic-bezier(.2,.8,.2,1) both }
      @keyframes yv-rays { to { transform: rotate(360deg) } }
      .yv-rays { animation: yv-rays 18s linear infinite }
      @media (prefers-reduced-motion: reduce) { .yv-stamp, .yv-rays { animation: none } }
    `}</style>
    </>
  );

  if (!signedIn) {
    return (
      <Panel>
        {styles}
        <div className="flex flex-col items-center gap-6 text-center md:flex-row md:text-left">
          <GameIcon name="decrypt" size={120} className="yv-float shrink-0" />
          <div className="font-mono">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-orange">Ready, explorer?</p>
            <h2 className="mt-1 font-display text-[26px] font-bold uppercase leading-tight text-white">Sign in to start the mission</h2>
            <p className="mt-1 font-sans text-[15px] text-[rgb(214_219_225/.7)]">Your answers are saved. Come back any time before the deadline.</p>
            <Link href={`/signin?next=${encodeURIComponent(returnTo)}`} className={`${bigBtn} mt-5`} style={plate(12)}>
              Sign in & start →
            </Link>
          </div>
        </div>
      </Panel>
    );
  }
  if (error) return <Panel><p className="text-danger">{error}</p></Panel>;
  if (!state) return <Panel><p className="font-mono text-[12px] uppercase tracking-[0.24em] text-[rgb(214_219_225/.5)]">Unrolling the map…</p></Panel>;

  const t = state.timeline;
  const lockIn = left(t.endsAt, now);

  if (!state.joined) {
    return (
      <Panel tone="rgb(255 145 56 / .45)">
        {styles}
        <div className="flex flex-col items-center gap-7 text-center md:flex-row md:text-left">
          <div className="relative shrink-0">
            <span aria-hidden className="yv-rays absolute -inset-6 rounded-full bg-[conic-gradient(from_0deg,transparent,rgb(255_145_56/.18),transparent_30%,rgb(255_194_75/.14),transparent_60%)]" />
            <GameIcon name="decrypt" size={140} className="yv-float relative" />
          </div>
          <div className="flex-1 font-mono">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-orange">Briefing</p>
            <h2 className="mt-1 font-display text-[28px] font-bold uppercase leading-tight text-white">
              Decrypt {state.total} secret{state.total === 1 ? "" : "s"} to qualify for the prize pool
            </h2>
            <ul className="mt-3 space-y-1.5 text-[11.5px] font-bold uppercase tracking-[0.14em] text-[rgb(214_219_225/.75)]">
              <li><span className="text-orange">▸</span> Every lock is open: decrypt them in any order</li>
              <li><span className="text-orange">▸</span> Answers are sealed: change them any time until the deadline</li>
              <li><span className="text-orange">▸</span> Stuck? Do an on-chain activity to decrypt a hint</li>
              <li><span className="text-orange">▸</span> Results are revealed when the mission ends</li>
            </ul>
            {status !== "LIVE" || t.closed ? (
              <p className="mt-5 text-[12px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.5)]">{status === "SCHEDULED" ? `Opens ${when(t.startsAt)}` : "This mission has ended"}</p>
            ) : (
              <button
                type="button"
                className={`${bigBtn} mt-6 h-14 px-8 text-[14px]`}
                style={plate(12)}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api(`/api/campaigns/${campaignId}/join`, { method: "POST" });
                    await load();
                  } catch (e) {
                    setError(e instanceof ApiError ? e.message : "Couldn't start the mission.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Starting…" : "Start the mission →"}
              </button>
            )}
            {lockIn && !t.closed && <p className="mt-3 text-[10.5px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.5)]">Answers lock in {lockIn}</p>}
          </div>
        </div>
      </Panel>
    );
  }

  const allSealed = state.answered === state.total;
  const setHints = (qid: string, hints: HintCard[]) =>
    setState((prev) => (prev && prev.joined ? { ...prev, questions: prev.questions.map((q) => (q.id === qid ? { ...q, hints } : q)) } : prev));

  return (
    <div className="flex flex-col gap-4">
      {styles}
      <Burst trigger={burst} />

      {/* world map trace: one lock per secret, scattered across the map */}
      <div className="relative font-mono">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-1 text-[11px] font-bold uppercase tracking-[0.12em]">
          <span className="flex items-center gap-1.5 text-white">{Array.from({ length: state.total }, (_, i) => <span key={i} className={`size-2.5 rounded-full ${state.questions[i]?.saved ? "bg-gold" : "bg-[rgb(214_219_225/.2)]"}`} />)} <span className="ml-1 text-[rgb(214_219_225/.6)]">{t.closed ? "Results are in!" : `${state.answered}/${state.total} locked in`}</span></span>
<span className="rounded-full bg-[rgb(255_145_56/.14)] px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-orange">{t.closed ? `Ended ${when(t.endsAt)}` : `${lockIn ?? "—"} left`}</span>
        </div>
        <div className="px-2 pb-6 pt-1">
          <LockGrid questions={state.questions} total={state.total} closed={t.closed} active={active} onPick={setActive} />
        </div>
        {!t.closed && (
          <p className="px-4 pb-3 text-center font-sans text-[13px] text-[rgb(214_219_225/.6)]">
            {allSealed ? "All locks are in! You can still change answers until the deadline." : "Find each answer and lock it in. Results are revealed at the deadline."}
          </p>
        )}
      </div>

      {/* the outcome, once revealed */}
      {t.closed && (
        <Panel tone={state.qualification === "qualified" ? "rgb(52 211 153 / .7)" : `${INK} / .2)`} className="text-center">
          {state.qualification === "qualified" ? (
            <>
              <div className="relative mx-auto w-fit">
                <span aria-hidden className="yv-rays absolute -inset-8 rounded-full bg-[conic-gradient(from_0deg,transparent,rgb(52_211_153/.3),transparent_20%,rgb(255_194_75/.3),transparent_45%,rgb(52_211_153/.3),transparent_70%)]" />
                <GameIcon name="earn" size={120} className="relative" />
              </div>
              <p className="yv-stamp mx-auto mt-3 w-fit border-2 border-mint-ink px-4 py-1 font-mono text-[12px] font-black uppercase tracking-[0.3em] text-mint-ink">Qualified</p>
              <h2 className="mt-3 font-display text-[26px] font-bold uppercase text-white">Every secret decrypted!</h2>
              <p className="mx-auto mt-1 max-w-md font-sans text-[15px] text-[rgb(214_219_225/.7)]">You&apos;re in the prize pool. Winners are paid by the mission&apos;s rules; check your Progress panel.</p>
              <Link href="/explore?panel=progress" className={`${bigBtn} mt-5`} style={plate(12)} onClick={() => setBurst((b) => b + 1)}>
                See my rewards
              </Link>
            </>
          ) : (
            <>
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.26em] text-[rgb(214_219_225/.6)]">Mission over</p>
              <h2 className="mt-1 font-display text-[26px] font-bold uppercase text-white">
                {state.correctCount ?? 0} / {state.total} correct
              </h2>
              <p className="mx-auto mt-1 max-w-md font-sans text-[15px] text-[rgb(214_219_225/.7)]">
                {state.qualification === "held" ? "Your result is being reviewed." : "Not every lock this time. Pick a sphere to see the answers. Try another mission!"}
              </p>
              <Link href="/explore" className="mt-4 inline-flex h-11 items-center px-6 font-mono text-[11.5px] font-bold uppercase tracking-[0.18em] text-[rgb(214_219_225/.8)] hover:text-white" style={frame(10, `${INK} / .25)`)}>
                Find another mission
              </Link>
            </>
          )}
        </Panel>
      )}

      {state.questions[active] && (
        <SecretConsole
          key={state.questions[active]!.id}
          q={state.questions[active]!}
          total={state.total}
          campaignId={campaignId}
          closed={t.closed}
          onNav={(d) => setActive(Math.min(state.total - 1, Math.max(0, active + d)))}
          onSaved={() => {
            const q = state.questions[active]!;
            const completes = state.answered + (q.saved ? 0 : 1) === state.total;
            void load();
            if (completes) setBurst((b) => b + 1);
            else if (!q.saved) {
              const next = state.questions.findIndex((x, i) => i !== active && !x.saved);
              if (next >= 0) setTimeout(() => setActive(next), 900);
            }
          }}
          onHints={(h) => setHints(state.questions[active]!.id, h)}
        />
      )}
    </div>
  );
}
