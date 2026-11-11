"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { HintCards, type HintCard } from "@/components/campaign/HintCards";
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
const HEX = "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)";
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

/** Trail of hex waypoints: filled once an answer is sealed in (or, after the end, green/red by result). */
function Trail({ questions, total, closed }: { questions: Question[] | null; total: number; closed: boolean }) {
  return (
    <div className="flex items-center">
      {Array.from({ length: total }, (_, i) => {
        const q = questions?.[i];
        const tone = closed ? (q?.result?.correct ? "#34d399" : "#f87171") : q?.saved ? "#FFC24B" : "rgb(214 219 225 / .22)";
        const filled = closed || Boolean(q?.saved);
        return (
          <div key={i} className="flex flex-1 items-center">
            <span className="relative grid size-9 shrink-0 place-items-center">
              <span className="absolute inset-0" style={{ clipPath: HEX, background: tone }} />
              <span
                className={`absolute inset-[2px] grid place-items-center font-mono text-[11px] font-black ${filled ? "text-[#1a1206]" : "text-[rgb(214_219_225/.5)]"}`}
                style={{ clipPath: HEX, background: filled ? tone : "linear-gradient(180deg,#141922,#07090c)" }}
              >
                {closed ? (q?.result?.correct ? "✓" : "✗") : q?.saved ? "◆" : pad(i + 1)}
              </span>
            </span>
            <span className={`mx-1 h-[2px] flex-1 ${filled ? "bg-[linear-gradient(90deg,#FFC24B,#FF9138)]" : "bg-[repeating-linear-gradient(90deg,rgb(214_219_225/.25)_0_5px,transparent_5px_10px)]"}`} />
          </div>
        );
      })}
      <GameIcon name="earn" size={46} className={closed ? "" : "opacity-80 grayscale-[.3]"} />
    </div>
  );
}

/** One clue: answer field that can be saved and edited until the deadline; never says right or wrong before the end. */
function ClueCard({ q, total, campaignId, returnTo, closed, onSaved, onHints }: { q: Question; total: number; campaignId: string; returnTo: string; closed: boolean; onSaved(): void; onHints(h: HintCard[]): void }) {
  const [value, setValue] = useState(q.saved ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => setValue(q.saved ?? ""), [q.saved]);
  const dirty = value.trim() !== (q.saved ?? "").trim();

  const save = async (v: string) => {
    if (!v.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/campaigns/${campaignId}/answer`, { method: "POST", body: { questionId: q.id, answer: v } });
      setFlash(true);
      setTimeout(() => setFlash(false), 900);
      setMsg({ tone: "ok", text: q.saved ? "Answer updated and sealed" : "Answer sealed" });
      onSaved();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof ApiError ? e.message : "Couldn't save. Your other answers are safe." });
    } finally {
      setBusy(false);
    }
  };

  const tone = closed ? (q.result?.correct ? "rgb(52 211 153 / .7)" : "rgb(248 113 113 / .6)") : flash ? "rgb(255 194 75 / .9)" : q.saved ? "rgb(255 194 75 / .4)" : `${INK} / .14)`;
  return (
    <Panel tone={tone}>
      {flash && <span className="yv-stamp absolute right-5 top-5 border-2 border-reward px-3 py-1 font-mono text-[11px] font-black uppercase tracking-[0.3em] text-reward">Sealed</span>}
      <div className="flex flex-wrap items-center gap-3 font-mono">
        <span className="bg-[rgb(255_194_75/.12)] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-reward">Clue {pad(q.index + 1)}</span>
        <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.45)]">of {pad(total)}</span>
        {!closed && q.saved && <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.2em] text-gold">◆ Sealed {q.savedAt ? `· ${new Date(q.savedAt).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}` : ""}</span>}
        {closed && <span className={`ml-auto text-[11px] font-black uppercase tracking-[0.2em] ${q.result?.correct ? "text-mint-ink" : "text-danger"}`}>{q.result?.correct ? "✓ Correct" : q.saved ? "✗ Not quite" : "✗ No answer"}</span>}
      </div>
      <h3 className="mt-3 whitespace-pre-line font-display text-[21px] font-bold leading-snug text-white md:text-[24px]">{q.prompt}</h3>
      {q.clue && <p className="mt-2 font-sans text-[14px] italic text-[rgb(214_219_225/.65)]">{q.clue}</p>}
      {q.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={q.imageUrl} alt="Image for this clue" className="mt-3 max-h-72 border border-[rgb(255_255_255/.1)] object-contain" />
      )}
      {q.referenceUrl && (
        <a href={q.referenceUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-orange hover:underline">
          Investigate ↗
        </a>
      )}

      {closed ? (
        <div className="mt-4 font-mono">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.5)]">Your answer</p>
          <p className="mt-1 font-sans text-[15px] text-white">{q.type === "multiple_choice" ? (q.options?.find((o) => o.id === q.saved)?.label ?? "—") : (q.saved ?? "—")}</p>
          {q.result?.reveal && (
            <div className="mt-3 bg-[rgb(255_194_75/.07)] p-3" style={frame(8, "rgb(255 194 75 / .3)")}>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-reward">Revealed</p>
              <p className="mt-1 whitespace-pre-line font-sans text-[14px] text-[rgb(214_219_225/.85)]">{q.result.reveal}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5">
          {q.type === "multiple_choice" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {q.options!.map((o, i) => {
                const picked = (q.saved ?? "") === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={busy}
                    onClick={() => save(o.id)}
                    aria-pressed={picked}
                    className={`group flex items-center gap-3 px-4 py-3.5 text-left text-[15px] font-medium text-white transition-colors disabled:opacity-50 ${picked ? "bg-[rgb(255_194_75/.12)]" : "bg-[rgb(255_255_255/.03)] hover:bg-[rgb(255_145_56/.1)]"}`}
                    style={frame(10, picked ? "rgb(255 194 75 / .6)" : `${INK} / .18)`)}
                  >
                    <span className={`grid size-7 shrink-0 place-items-center border font-mono text-[12px] font-black ${picked ? "border-reward text-reward" : "border-[rgb(214_219_225/.3)] text-[rgb(214_219_225/.7)] group-hover:border-orange group-hover:text-orange"}`}>
                      {picked ? "◆" : String.fromCharCode(65 + i)}
                    </span>
                    {o.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                void save(value);
              }}
            >
              <label htmlFor={`a-${q.id}`} className="sr-only">Your answer</label>
              <input
                id={`a-${q.id}`}
                autoComplete="off"
                inputMode={q.type === "numeric" ? "decimal" : "text"}
                className="h-12 w-full border border-[rgb(255_255_255/.14)] bg-[rgb(60_76_100/.12)] px-4 font-mono text-[16px] tracking-[0.04em] text-white placeholder:text-[rgb(214_219_225/.35)] focus:border-orange focus:outline-none"
                placeholder="Type your answer"
                value={value}
                maxLength={500}
                onChange={(e) => setValue(e.target.value)}
              />
              <button type="submit" className={`${bigBtn} shrink-0`} style={plate(11)} disabled={busy || !value.trim() || !dirty}>
                {busy ? "Sealing…" : q.saved ? (dirty ? "Update" : "Sealed ◆") : "Seal answer"}
              </button>
            </form>
          )}
          <p className="mt-2 min-h-5 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" aria-live="polite">
            {msg ? <span className={msg.tone === "ok" ? "text-gold" : "text-danger"}>{msg.text}</span> : <span className="text-[rgb(214_219_225/.4)]">You can change this any time before the deadline</span>}
          </p>
          {q.hints.length > 0 && <HintCards campaignId={campaignId} hints={q.hints} returnTo={returnTo} onChange={onHints} />}
        </div>
      )}
    </Panel>
  );
}

export function HuntPlayer({ campaignId, status, signedIn, returnTo }: { campaignId: string; status: string; signedIn: boolean; returnTo: string }) {
  const [state, setState] = useState<PlayState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const now = useNow();

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
    <style>{`
      @keyframes yv-stamp { 0% { opacity: 0; transform: scale(1.8) rotate(-12deg) } 40% { opacity: 1; transform: scale(.95) rotate(-6deg) } 100% { opacity: 1; transform: scale(1) rotate(-6deg) } }
      .yv-stamp { animation: yv-stamp 420ms cubic-bezier(.2,.8,.2,1) both }
      @keyframes yv-rays { to { transform: rotate(360deg) } }
      .yv-rays { animation: yv-rays 18s linear infinite }
      @media (prefers-reduced-motion: reduce) { .yv-stamp, .yv-rays { animation: none } }
    `}</style>
  );

  if (!signedIn) {
    return (
      <Panel>
        {styles}
        <div className="flex flex-col items-center gap-6 text-center md:flex-row md:text-left">
          <GameIcon name="explore" size={120} className="yv-float shrink-0" />
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
            <GameIcon name="explore" size={140} className="yv-float relative" />
          </div>
          <div className="flex-1 font-mono">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-orange">Briefing</p>
            <h2 className="mt-1 font-display text-[28px] font-bold uppercase leading-tight text-white">
              Crack {state.total} clue{state.total === 1 ? "" : "s"} to qualify for the prize pool
            </h2>
            <ul className="mt-3 space-y-1.5 text-[11.5px] font-bold uppercase tracking-[0.14em] text-[rgb(214_219_225/.75)]">
              <li><span className="text-orange">▸</span> Every clue is open: answer in any order</li>
              <li><span className="text-orange">▸</span> Answers are sealed: change them any time until the deadline</li>
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

      {/* status bar: trail, count, countdown */}
      <Panel className="py-4 md:py-5" tone={t.closed ? (state.qualification === "qualified" ? "rgb(52 211 153 / .6)" : `${INK} / .2)`) : allSealed ? "rgb(255 194 75 / .5)" : `${INK} / .14)`}>
        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.22em]">
          <span className="text-[rgb(214_219_225/.55)]">{t.closed ? "Results" : `${state.answered} / ${state.total} sealed`}</span>
          {t.closed ? (
            <span className="text-[rgb(214_219_225/.7)]">Ended {when(t.endsAt)}</span>
          ) : (
            <span className="text-orange">⏱ Answers lock in {lockIn ?? "—"}</span>
          )}
        </div>
        <div className="mt-3">
          <Trail questions={state.questions} total={state.total} closed={t.closed} />
        </div>
        {!t.closed && (
          <p className="mt-3 font-sans text-[13px] text-[rgb(214_219_225/.65)]">
            {allSealed ? "All clues sealed. You can still change any answer until the deadline. Results are revealed when it ends." : "Your answers stay sealed: we never say right or wrong before the deadline, so nobody can brute-force the clues."}
          </p>
        )}
      </Panel>

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
              <h2 className="mt-3 font-display text-[26px] font-bold uppercase text-white">Every clue cracked!</h2>
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
                {state.qualification === "held" ? "Your result is being reviewed." : "Not every clue this time. The answers are revealed below. Try another mission!"}
              </p>
              <Link href="/explore" className="mt-4 inline-flex h-11 items-center px-6 font-mono text-[11.5px] font-bold uppercase tracking-[0.18em] text-[rgb(214_219_225/.8)] hover:text-white" style={frame(10, `${INK} / .25)`)}>
                Find another mission
              </Link>
            </>
          )}
        </Panel>
      )}

      {state.questions.map((q) => (
        <ClueCard
          key={q.id}
          q={q}
          total={state.total}
          campaignId={campaignId}
          returnTo={returnTo}
          closed={t.closed}
          onSaved={() => {
            void load().then(() => {
              /* celebrate the moment the last clue is sealed */
            });
            if (state.answered + (q.saved ? 0 : 1) === state.total) setBurst((b) => b + 1);
          }}
          onHints={(h) => setHints(q.id, h)}
        />
      ))}
    </div>
  );
}
