"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
  maxAttempts: number;
  attemptsUsed: number;
  cooldownUntil: string | null;
  hints: HintCard[];
}
type PlayState =
  | { status: string; joined: false; total: number }
  | { status: string; joined: true; total: number; progress: number; entryStatus: string; score: number; completedAt: string | null; question: Question | null };

const INK = "rgb(214 219 225";
const HEX = "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)";
const pad = (n: number) => String(n).padStart(2, "0");

/** The trail across the map: hex waypoints joined by a dashed route, ending at the treasure. */
function Trail({ total, progress, done }: { total: number; progress: number; done: boolean }) {
  return (
    <div className="font-mono" aria-label={`Clue ${Math.min(progress + 1, total)} of ${total}`}>
      <div className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.24em]">
        <span className="text-[rgb(214_219_225/.55)]">Treasure trail</span>
        <span className="text-orange">{done ? "Treasure found" : `${Math.round((progress / Math.max(1, total)) * 100)}% explored`}</span>
      </div>
      <div className="mt-3 flex items-center">
        {Array.from({ length: total }, (_, i) => {
          const passed = i < progress || done;
          const here = i === progress && !done;
          return (
            <div key={i} className="flex flex-1 items-center">
              <span className="relative grid size-10 shrink-0 place-items-center">
                <span className="absolute inset-0" style={{ clipPath: HEX, background: passed ? "#FFC24B" : here ? "#FF9138" : "rgb(214 219 225 / .2)" }} />
                <span
                  className={`absolute inset-[2px] grid place-items-center text-[12px] font-black ${passed ? "text-[#2a1600]" : here ? "text-orange" : "text-[rgb(214_219_225/.45)]"}`}
                  style={{ clipPath: HEX, background: passed ? "linear-gradient(180deg,#ffd27a,#ffb02e)" : "linear-gradient(180deg,#141922,#07090c)" }}
                >
                  {passed ? "✓" : pad(i + 1)}
                </span>
                {here && <span aria-hidden className="absolute -inset-1.5 border border-orange/70" style={{ clipPath: HEX, animation: "yv-pulse-ring 1.8s ease-out infinite" }} />}
              </span>
              <span className={`mx-1 h-[2px] flex-1 ${i < progress || done ? "bg-[linear-gradient(90deg,#FFC24B,#FF9138)]" : "bg-[repeating-linear-gradient(90deg,rgb(214_219_225/.25)_0_5px,transparent_5px_10px)]"}`} />
            </div>
          );
        })}
        <span className={`relative grid size-14 shrink-0 place-items-center ${done ? "yv-chest-open" : ""}`} aria-hidden>
          <span className={`absolute inset-0 rounded-full ${done ? "bg-[radial-gradient(circle,rgb(255_194_75/.55),transparent_70%)]" : "bg-[radial-gradient(circle,rgb(255_194_75/.18),transparent_70%)]"}`} />
          <GameIcon name="earn" size={52} className={done ? "" : "opacity-80 grayscale-[.3]"} />
          {!done && <span className="absolute -bottom-1 font-mono text-[9px] font-black tracking-[0.2em] text-[rgb(255_194_75/.8)]">X</span>}
        </span>
      </div>
    </div>
  );
}

/** Dark angled game panel. */
function Panel({ children, tone = `${INK} / .14)`, className = "" }: { children: React.ReactNode; tone?: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[rgb(8_11_16/.82)] p-6 backdrop-blur-xl md:p-8 ${className}`} style={frame(18, tone)}>
      {children}
    </div>
  );
}

const bigBtn =
  "inline-flex h-14 items-center gap-3 bg-[linear-gradient(180deg,#ffa458,#ff8a2a)] px-8 font-mono text-[14px] font-black uppercase tracking-[0.18em] text-[#140c05] shadow-[0_0_28px_rgb(255_145_56/.45)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgb(255_145_56/.65)] disabled:opacity-50";

export function HuntPlayer({ campaignId, status, signedIn, returnTo }: { campaignId: string; status: string; signedIn: boolean; returnTo: string }) {
  const [state, setState] = useState<PlayState | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [win, setWin] = useState(0);
  const [shake, setShake] = useState(0);
  const [flash, setFlash] = useState<"ok" | "bad" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Coming back from a partner quest: refresh hints without losing the current clue.
  useEffect(() => {
    if (!signedIn) return;
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [signedIn, load]);

  const cooldown = state?.joined ? state.question?.cooldownUntil : null;
  useEffect(() => {
    if (!cooldown) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [cooldown]);
  const coolLeft = cooldown ? Math.max(0, Math.ceil((Date.parse(cooldown) - now) / 1000)) : 0;

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [flash]);

  const styles = (
    <style>{`
      @keyframes yv-chest { 0% { transform: scale(.6) rotate(-10deg) } 60% { transform: scale(1.15) rotate(4deg) } 100% { transform: none } }
      .yv-chest-open { animation: yv-chest 700ms cubic-bezier(.2,.8,.2,1) both }
      @keyframes yv-stamp { 0% { opacity: 0; transform: scale(1.8) rotate(-12deg) } 40% { opacity: 1; transform: scale(.95) rotate(-6deg) } 100% { opacity: 1; transform: scale(1) rotate(-6deg) } }
      .yv-stamp { animation: yv-stamp 420ms cubic-bezier(.2,.8,.2,1) both }
      @keyframes yv-rays { to { transform: rotate(360deg) } }
      .yv-rays { animation: yv-rays 18s linear infinite }
      @media (prefers-reduced-motion: reduce) { .yv-chest-open, .yv-stamp, .yv-rays { animation: none } }
    `}</style>
  );

  if (!signedIn) {
    return (
      <Panel>
        {styles}
        <div className="flex flex-col items-center gap-6 text-center md:flex-row md:text-left">
          <GameIcon name="explore" size={130} className="yv-float shrink-0" />
          <div className="font-mono">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-orange">Ready, explorer?</p>
            <h2 className="mt-1 font-display text-[28px] font-bold uppercase leading-tight text-white">Sign in to start the hunt</h2>
            <p className="mt-1 font-sans text-[15px] text-[rgb(214_219_225/.7)]">Your progress is saved. Come back any time.</p>
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

  if (!state.joined) {
    return (
      <Panel tone="rgb(255 145 56 / .45)">
        {styles}
        <div className="flex flex-col items-center gap-7 text-center md:flex-row md:text-left">
          <div className="relative shrink-0">
            <span aria-hidden className="yv-rays absolute -inset-6 rounded-full bg-[conic-gradient(from_0deg,transparent,rgb(255_145_56/.18),transparent_30%,rgb(255_194_75/.14),transparent_60%)]" />
            <GameIcon name="explore" size={150} className="yv-float relative" />
          </div>
          <div className="flex-1 font-mono">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-orange">Briefing</p>
            <h2 className="mt-1 font-display text-[30px] font-bold uppercase leading-tight text-white">
              {state.total} clue{state.total === 1 ? "" : "s"} stand between you and the treasure
            </h2>
            <ul className="mt-3 space-y-1.5 text-[11.5px] font-bold uppercase tracking-[0.14em] text-[rgb(214_219_225/.75)]">
              <li><span className="text-orange">▸</span> Crack each clue to move along the trail</li>
              <li><span className="text-orange">▸</span> Stuck? Unlock a hint</li>
              <li><span className="text-orange">▸</span> Reach the X to qualify for the prize</li>
            </ul>
            {status !== "LIVE" ? (
              <p className="mt-5 text-[12px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.5)]">{status === "SCHEDULED" ? "The hunt hasn't started yet" : "This hunt is closed"}</p>
            ) : (
              <button
                type="button"
                className={`${bigBtn} mt-6`}
                style={plate(12)}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setFeedback(null);
                  try {
                    await api(`/api/campaigns/${campaignId}/join`, { method: "POST" });
                    await load();
                  } catch (e) {
                    setFeedback({ tone: "danger", text: e instanceof ApiError ? e.message : "Couldn't start the hunt." });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Starting…" : "Start the hunt →"}
              </button>
            )}
            {feedback && <p className="mt-3 font-sans text-[14px] text-danger">{feedback.text}</p>}
          </div>
        </div>
      </Panel>
    );
  }

  if (state.entryStatus === "completed") {
    return (
      <Panel tone="rgb(255 194 75 / .6)">
        {styles}
        <Burst trigger={1} />
        <Trail total={state.total} progress={state.total} done />
        <div className="mt-8 text-center font-mono">
          <div className="relative mx-auto w-fit">
            <span aria-hidden className="yv-rays absolute -inset-10 rounded-full bg-[conic-gradient(from_0deg,transparent,rgb(255_194_75/.35),transparent_15%,rgb(255_194_75/.3),transparent_35%,rgb(255_194_75/.3),transparent_55%,rgb(255_194_75/.3),transparent_75%)]" />
            <GameIcon name="earn" size={170} className="yv-chest-open relative" />
          </div>
          <p className="yv-stamp mx-auto mt-4 w-fit border-2 border-reward px-4 py-1 text-[13px] font-black uppercase tracking-[0.3em] text-reward">Treasure found</p>
          <h2 className="mt-3 font-display text-[30px] font-bold uppercase text-white">You cracked every clue!</h2>
          <p className="mx-auto mt-1 max-w-md font-sans text-[15px] text-[rgb(214_219_225/.7)]">Winners are picked by the mission&apos;s rules when it ends. We&apos;ll let you know.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/explore?panel=progress" className={bigBtn} style={plate(12)}>
              My rewards
            </Link>
            <Link href="/explore" className="inline-flex h-14 items-center px-6 text-[12px] font-bold uppercase tracking-[0.18em] text-[rgb(214_219_225/.8)] hover:text-white" style={frame(12, `${INK} / .25)`)}>
              Find another hunt
            </Link>
          </div>
        </div>
      </Panel>
    );
  }

  const q = state.question;
  if (!q) return <Panel><p className="text-[rgb(214_219_225/.6)]">This hunt is not available right now.</p></Panel>;
  const limited = q.maxAttempts < 100;
  const out = q.attemptsUsed >= q.maxAttempts;
  const locked = busy || out || coolLeft > 0;

  const submit = async (value: string) => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const r = await api<{ correct: boolean; completed: boolean; attemptsLeft: number }>(`/api/campaigns/${campaignId}/answer`, {
        method: "POST",
        body: { questionId: q.id, answer: value },
      });
      if (r.correct) {
        setAnswer("");
        setWin((w) => w + 1);
        setFlash("ok");
        setFeedback({ tone: "ok", text: r.completed ? "Treasure found!" : "Clue cracked! On to the next one." });
      } else {
        setShake((s) => s + 1);
        setFlash("bad");
        setFeedback({ tone: "warn", text: limited && r.attemptsLeft <= 0 ? "That was your last try for this clue." : "Not quite. Try again in a minute, or unlock a hint." });
      }
      setTimeout(() => void load(), r.correct ? 900 : 0);
      inputRef.current?.focus();
    } catch (e) {
      setShake((s) => s + 1);
      setFlash("bad");
      setFeedback({ tone: "danger", text: e instanceof ApiError ? e.message : "Something went wrong. Your progress is safe." });
      if (e instanceof ApiError && e.code === "stale_question") await load();
    } finally {
      setBusy(false);
    }
  };

  const tone = flash === "ok" ? "rgb(110 231 183 / .9)" : flash === "bad" ? "rgb(255 99 99 / .85)" : "rgb(255 194 75 / .4)";
  return (
    <div className="flex flex-col gap-4">
      {styles}
      <Burst trigger={win} />
      <Panel className="py-5 md:py-6">
        <Trail total={state.total} progress={state.progress} done={false} />
      </Panel>

      <div key={q.id} className={`yv-enter ${shake ? "yv-shake" : ""}`} onAnimationEnd={() => setShake(0)}>
        <Panel tone={tone} className="transition-[box-shadow]">
          {flash === "ok" && (
            <span className="yv-stamp absolute right-6 top-6 border-2 border-mint-ink px-3 py-1 font-mono text-[12px] font-black uppercase tracking-[0.3em] text-mint-ink">Cracked</span>
          )}
          <div className="font-mono">
            <div className="flex flex-wrap items-center gap-3">
              <span className="bg-[rgb(255_194_75/.12)] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-reward">Clue {pad(q.index + 1)}</span>
              <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.45)]">of {pad(state.total)}</span>
              {limited && (
                <span className="ml-auto flex items-center gap-1" aria-label={`${Math.max(0, q.maxAttempts - q.attemptsUsed)} tries left`}>
                  {Array.from({ length: Math.min(q.maxAttempts, 10) }, (_, i) => (
                    <span key={i} className={`h-2 w-3 ${i < q.maxAttempts - q.attemptsUsed ? "bg-orange" : "bg-[rgb(214_219_225/.15)]"}`} style={{ clipPath: "polygon(0 0, 100% 0, 80% 100%, 0 100%)" }} />
                  ))}
                </span>
              )}
            </div>
            <h2 className="mt-4 whitespace-pre-line font-display text-[24px] font-bold leading-snug text-white md:text-[28px]">{q.prompt}</h2>
          </div>
          {q.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={q.imageUrl} alt="Image for this clue" className="mt-4 max-h-80 border border-[rgb(255_255_255/.1)] object-contain" />
          )}

          <div className="mt-6">
            {q.type === "multiple_choice" ? (
              <fieldset disabled={locked}>
                <legend className="sr-only">Choose an answer</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {q.options!.map((o, i) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => submit(o.id)}
                      className="group flex items-center gap-3 bg-[rgb(255_255_255/.03)] px-4 py-3.5 text-left text-[15px] font-medium text-white transition-colors hover:bg-[rgb(255_145_56/.12)] disabled:opacity-50"
                      style={frame(10, `${INK} / .18)`)}
                    >
                      <span className="grid size-7 shrink-0 place-items-center border border-[rgb(214_219_225/.3)] font-mono text-[12px] font-black text-[rgb(214_219_225/.7)] group-hover:border-orange group-hover:text-orange">
                        {String.fromCharCode(65 + i)}
                      </span>
                      {o.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : (
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(answer);
                }}
              >
                <label htmlFor="answer" className="sr-only">Your answer</label>
                <input
                  ref={inputRef}
                  id="answer"
                  autoComplete="off"
                  inputMode={q.type === "numeric" ? "decimal" : "text"}
                  className="h-14 w-full border border-[rgb(255_255_255/.14)] bg-[rgb(60_76_100/.12)] px-4 font-mono text-[17px] tracking-[0.06em] text-white placeholder:text-[rgb(214_219_225/.35)] focus:border-orange focus:outline-none disabled:opacity-50"
                  placeholder="Type your answer"
                  value={answer}
                  maxLength={500}
                  disabled={locked}
                  onChange={(e) => setAnswer(e.target.value)}
                />
                <button type="submit" className={`${bigBtn} shrink-0 justify-center`} style={plate(12)} disabled={locked || !answer.trim()}>
                  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24">
                    <rect x="5" y="11" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
                    <path d="M8 11V8a4 4 0 0 1 7.5-2" fill="none" stroke="currentColor" strokeWidth="2.4" />
                  </svg>
                  {busy ? "Checking…" : "Unlock"}
                </button>
              </form>
            )}
            <p className="mt-3 min-h-5 font-mono text-[12px] font-bold uppercase tracking-[0.14em]" aria-live="polite">
              {feedback ? (
                <span className={feedback.tone === "ok" ? "text-mint-ink" : feedback.tone === "warn" ? "text-gold" : "text-danger"}>{feedback.text}</span>
              ) : out ? (
                <span className="text-[rgb(214_219_225/.5)]">No tries left for this clue</span>
              ) : coolLeft > 0 ? (
                <span className="text-[rgb(214_219_225/.5)]">Next try in {coolLeft}s</span>
              ) : null}
            </p>
          </div>
        </Panel>
      </div>

      <HintCards
        campaignId={campaignId}
        hints={q.hints}
        returnTo={returnTo}
        onChange={(hints) => setState((prev) => (prev && prev.joined && prev.question ? { ...prev, question: { ...prev.question, hints } } : prev))}
      />
    </div>
  );
}
