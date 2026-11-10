"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, buttonClass, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { HintCards, type HintCard } from "@/components/campaign/HintCards";
import { TreasureChest, TreasureMap } from "@/components/art/Art";
import { Burst } from "@/components/art/Burst";

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

/** The trail: one stop per clue, ending at the chest. */
function Trail({ total, progress, done }: { total: number; progress: number; done: boolean }) {
  return (
    <div className="relative" aria-label={`Clue ${Math.min(progress + 1, total)} of ${total}`}>
      <div className="flex items-center">
        {Array.from({ length: total }, (_, i) => {
          const passed = i < progress || done;
          const here = i === progress && !done;
          return (
            <div key={i} className="flex flex-1 items-center">
              <span
                className={`relative grid size-9 shrink-0 place-items-center rounded-full font-display text-[13px] font-bold transition-all duration-500 ${
                  passed ? "bg-orange text-[#140c05]" : here ? "border-2 border-sky bg-sky-wash text-sky" : "border border-line-strong bg-card text-ink-3"
                }`}
              >
                {passed ? "✓" : i + 1}
                {here && <span aria-hidden className="absolute inset-0 rounded-full border-2 border-sky" style={{ animation: "yv-pulse-ring 1.8s ease-out infinite" }} />}
              </span>
              <span className={`mx-1 h-[3px] flex-1 rounded-full ${i < progress || done ? "bg-orange" : "bg-[repeating-linear-gradient(90deg,#2f3a4d_0_6px,transparent_6px_12px)]"}`} />
            </div>
          );
        })}
        <span className={`grid size-12 shrink-0 place-items-center rounded-full ${done ? "bg-reward yv-glow" : "border border-gold/40 bg-gold-wash"}`} aria-hidden>
          <TreasureChest size={40} />
        </span>
      </div>
    </div>
  );
}

export function HuntPlayer({ campaignId, status, signedIn, returnTo }: { campaignId: string; status: string; signedIn: boolean; returnTo: string }) {
  const [state, setState] = useState<PlayState | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [win, setWin] = useState(0);
  const [shake, setShake] = useState(0);
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

  // Coming back from another vault: refresh hints without losing the current clue.
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

  const shell = (children: React.ReactNode, extra = "") => (
    <div className={`relative overflow-hidden rounded-[22px] border border-line bg-[linear-gradient(180deg,#121823,#0d1118)] p-6 shadow-pop md:p-8 ${extra}`}>{children}</div>
  );

  if (!signedIn) {
    return shell(
      <div className="flex flex-col items-center gap-6 text-center md:flex-row md:text-left">
        <TreasureMap size={150} className="shrink-0" />
        <div>
          <h2 className="text-2xl font-bold">Ready to hunt?</h2>
          <p className="mt-1 text-ink-2">Sign in to start. Your progress is saved — come back any time.</p>
          <Link href={`/signin?next=${encodeURIComponent(returnTo)}`} className={buttonClass("primary", "lg", "mt-4 yv-glow")}>
            Sign in & start
          </Link>
        </div>
      </div>,
    );
  }
  if (error) return shell(<p className="text-danger">{error}</p>);
  if (!state) return shell(<p className="text-ink-3">Unrolling the map…</p>);

  if (!state.joined) {
    return shell(
      <div className="flex flex-col items-center gap-6 text-center md:flex-row md:text-left">
        <TreasureMap size={160} className="shrink-0 yv-float" />
        <div className="flex-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-sky">{state.total} clues · 1 treasure</p>
          <h2 className="mt-1 text-[28px] font-bold leading-tight">Follow the trail to the prize.</h2>
          {status !== "LIVE" ? (
            <p className="mt-4 font-semibold text-ink-3">{status === "SCHEDULED" ? "This hunt hasn't started yet." : "This hunt is closed."}</p>
          ) : (
            <Button
              size="lg"
              className="yv-glow mt-5 h-14 px-8 text-[16px]"
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
            </Button>
          )}
          {feedback && <p className="mt-3 text-[14px] text-danger">{feedback.text}</p>}
        </div>
      </div>,
    );
  }

  if (state.entryStatus === "completed") {
    return shell(
      <div className="text-center">
        <Trail total={state.total} progress={state.total} done />
        <TreasureChest size={180} className="yv-pop mx-auto mt-6" />
        <h2 className="mt-2 text-[30px] font-bold">You cracked it!</h2>
        <p className="mx-auto mt-1 max-w-md text-ink-2">Every clue solved. Winners are picked by the quest&apos;s rules once it ends — we&apos;ll notify you.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/me/rewards" className={buttonClass("primary", "md")}>
            My rewards
          </Link>
          <Link href="/explore" className={buttonClass("dark", "md")}>
            Find another vault
          </Link>
        </div>
      </div>,
    );
  }

  const q = state.question;
  if (!q) return shell(<p className="text-ink-3">This hunt is not available right now.</p>);
  const limited = q.maxAttempts < 100;
  const out = q.attemptsUsed >= q.maxAttempts;

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
        setFeedback({ tone: "ok", text: r.completed ? "Treasure found!" : "Correct! On to the next clue." });
      } else {
        setShake((s) => s + 1);
        setFeedback({ tone: "warn", text: limited && r.attemptsLeft <= 0 ? "That was your last try for this clue." : "Not quite — try again in a minute, or unlock a hint." });
      }
      setTimeout(() => void load(), r.correct ? 650 : 0);
      inputRef.current?.focus();
    } catch (e) {
      setShake((s) => s + 1);
      setFeedback({ tone: "danger", text: e instanceof ApiError ? e.message : "Something went wrong. Your progress is safe." });
      if (e instanceof ApiError && e.code === "stale_question") await load();
    } finally {
      setBusy(false);
    }
  };

  return shell(
    <>
      <Burst trigger={win} />
      <Trail total={state.total} progress={state.progress} done={false} />
      <div key={q.id} className={`yv-enter mt-7 ${shake ? "yv-shake" : ""}`} onAnimationEnd={() => setShake(0)}>
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-sky">
          Clue {q.index + 1} of {state.total}
        </p>
        <h2 className="mt-2 whitespace-pre-line text-[24px] font-bold leading-snug md:text-[28px]">{q.prompt}</h2>
        {q.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={q.imageUrl} alt="Image for this clue" className="mt-4 max-h-80 rounded-xl border border-line object-contain" />
        )}

        <div className="mt-6">
          {q.type === "multiple_choice" ? (
            <fieldset disabled={busy || out || coolLeft > 0}>
              <legend className="sr-only">Choose an answer</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {q.options!.map((o) => (
                  <button key={o.id} type="button" onClick={() => submit(o.id)} className="rounded-xl border border-line-strong bg-card px-4 py-3 text-left text-sm font-medium hover:border-orange hover:bg-orange-wash disabled:opacity-50">
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
                className={`${inputClass} h-14 rounded-xl text-[17px]`}
                placeholder="Type your answer"
                value={answer}
                maxLength={500}
                disabled={busy || out || coolLeft > 0}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <Button type="submit" size="lg" className="h-14 rounded-xl px-8" disabled={busy || out || coolLeft > 0 || !answer.trim()}>
                {busy ? "Checking…" : "Unlock"}
              </Button>
            </form>
          )}
          <p className="mt-2 min-h-5 text-[13px]" aria-live="polite">
            {feedback ? (
              <span className={feedback.tone === "ok" ? "font-semibold text-mint-ink" : feedback.tone === "warn" ? "text-gold-ink" : "text-danger"}>{feedback.text}</span>
            ) : out ? (
              <span className="text-ink-3">No tries left for this clue.</span>
            ) : coolLeft > 0 ? (
              <span className="text-ink-3">Next try in {coolLeft}s</span>
            ) : limited ? (
              <span className="text-ink-3">{q.maxAttempts - q.attemptsUsed} tries left</span>
            ) : null}
          </p>
        </div>
      </div>
      <HintCards
        campaignId={campaignId}
        hints={q.hints}
        returnTo={returnTo}
        onChange={(hints) => setState((prev) => (prev && prev.joined && prev.question ? { ...prev, question: { ...prev.question, hints } } : prev))}
      />
    </>,
  );
}
