"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Notice, buttonClass, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

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
}
type PlayState =
  | { status: string; joined: false; total: number }
  | { status: string; joined: true; total: number; progress: number; entryStatus: string; score: number; completedAt: string | null; question: Question | null };

export function HuntPlayer({ campaignId, status, signedIn, returnTo }: { campaignId: string; status: string; signedIn: boolean; returnTo: string }) {
  const [state, setState] = useState<PlayState | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
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

  const cooldown = state?.joined ? state.question?.cooldownUntil : null;
  useEffect(() => {
    if (!cooldown) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [cooldown]);
  const coolLeft = cooldown ? Math.max(0, Math.ceil((Date.parse(cooldown) - now) / 1000)) : 0;

  if (!signedIn) {
    return (
      <Card className="p-6">
        <h2 className="text-xl font-semibold">Ready to explore?</h2>
        <p className="mt-1 text-sm text-ink-2">Sign in so we can save your progress — you can stop and come back any time.</p>
        <Link href={`/signin?next=${encodeURIComponent(returnTo)}`} className={buttonClass("primary", "lg", "mt-4")}>
          Sign in to start exploring
        </Link>
      </Card>
    );
  }
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!state) return <Card className="p-6 text-sm text-ink-3">Loading your trail…</Card>;

  if (!state.joined) {
    return (
      <Card className="p-6">
        <h2 className="text-xl font-semibold">{state.total} questions stand between you and the finish</h2>
        <p className="mt-1 text-sm text-ink-2">Answers are checked as you go. Your progress is saved on our side, so a refresh never loses your place.</p>
        {status !== "LIVE" ? (
          <p className="mt-4 text-sm font-medium text-ink-3">{status === "SCHEDULED" ? "This hunt hasn't started yet." : "This hunt is closed."}</p>
        ) : (
          <Button
            size="lg"
            className="mt-4"
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
            Start Exploring
          </Button>
        )}
        {feedback && <div className="mt-3"><Notice tone={feedback.tone}>{feedback.text}</Notice></div>}
      </Card>
    );
  }

  const pct = Math.round((state.progress / Math.max(1, state.total)) * 100);
  const progressBar = (
    <div className="mb-5">
      <div className="mb-1.5 flex justify-between text-[12.5px] font-medium text-ink-3">
        <span>
          {state.entryStatus === "completed" ? "Trail complete" : `Question ${Math.min(state.progress + 1, state.total)} of ${state.total}`}
        </span>
        <span className="tabular">{state.score} pts</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-paper-2" role="progressbar" aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={state.progress} aria-label="Hunt progress">
        <div className="h-full rounded-full bg-orange transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );

  if (state.entryStatus === "completed") {
    return (
      <Card className="p-6">
        {progressBar}
        <h2 className="text-2xl font-semibold">You found the end of the trail.</h2>
        <p className="mt-1 text-ink-2">Every answer checked out. Your result is recorded — winners are determined by this campaign's published rules after it closes.</p>
        <Link href="/me" className={buttonClass("secondary", "md", "mt-4")}>
          See my adventures
        </Link>
      </Card>
    );
  }

  const q = state.question;
  if (!q) return <Notice tone="warn">This hunt is not available right now.</Notice>;
  const out = q.attemptsUsed >= q.maxAttempts;

  const submit = async (value: string) => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const r = await api<{ correct: boolean; completed: boolean; attemptsLeft: number; qualification: string | null }>(`/api/campaigns/${campaignId}/answer`, {
        method: "POST",
        body: { questionId: q.id, answer: value },
      });
      if (r.correct) {
        setAnswer("");
        setFeedback({ tone: "ok", text: r.completed ? "That's it — trail complete!" : "Correct. The next clue is unlocked." });
      } else {
        setFeedback({ tone: "warn", text: r.attemptsLeft > 0 ? `Not quite. ${r.attemptsLeft} attempt${r.attemptsLeft === 1 ? "" : "s"} left.` : "That was your last attempt for this question." });
      }
      await load();
      inputRef.current?.focus();
    } catch (e) {
      setFeedback({ tone: "danger", text: e instanceof ApiError ? e.message : "Something went wrong. Your progress is safe." });
      if (e instanceof ApiError && e.code === "stale_question") await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      {progressBar}
      <div key={q.id} className="yv-enter">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-orange-ink">
          Clue {q.index + 1} · {"●".repeat(q.difficulty)}
          <span className="text-line-strong">{"●".repeat(5 - q.difficulty)}</span>
        </p>
        <h2 className="mt-2 whitespace-pre-line text-xl font-semibold leading-snug">{q.prompt}</h2>
        {q.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={q.imageUrl} alt="Image for this clue" className="mt-4 max-h-80 rounded-lg border border-line object-contain" />
        )}
        {q.clue && (
          <details className="mt-4 rounded-md bg-paper-2 px-4 py-2.5 text-sm">
            <summary className="cursor-pointer font-semibold">Need a hint?</summary>
            <p className="mt-1.5 whitespace-pre-line text-ink-2">{q.clue}</p>
          </details>
        )}
        {q.referenceUrl && (
          <a href={q.referenceUrl} target="_blank" rel="noopener noreferrer nofollow ugc" className="mt-3 inline-block text-sm font-semibold text-orange-ink hover:underline">
            Open the reference link ↗
          </a>
        )}

        <div className="mt-5">
          {q.type === "multiple_choice" ? (
            <fieldset disabled={busy || out || coolLeft > 0}>
              <legend className="sr-only">Choose an answer</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {q.options!.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => submit(o.id)}
                    className="rounded-md border border-line-strong bg-card px-4 py-3 text-left text-sm font-medium hover:border-orange-deep hover:bg-orange-wash disabled:opacity-50"
                  >
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
              <label htmlFor="answer" className="sr-only">
                Your answer
              </label>
              <input
                ref={inputRef}
                id="answer"
                autoComplete="off"
                inputMode={q.type === "numeric" ? "decimal" : "text"}
                className={`${inputClass} h-12 text-base`}
                placeholder={q.type === "numeric" ? "Enter a number" : "Type your answer"}
                value={answer}
                maxLength={500}
                disabled={busy || out || coolLeft > 0}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <Button type="submit" size="lg" disabled={busy || out || coolLeft > 0 || !answer.trim()}>
                {busy ? "Checking…" : "Submit"}
              </Button>
            </form>
          )}
          <p className="mt-2 text-[12.5px] text-ink-3" aria-live="polite">
            {out
              ? "No attempts left for this question."
              : coolLeft > 0
                ? `You can try again in ${coolLeft}s.`
                : `${q.maxAttempts - q.attemptsUsed} of ${q.maxAttempts} attempts left.`}
          </p>
        </div>
      </div>
      {feedback && (
        <div className="mt-4" aria-live="assertive">
          <Notice tone={feedback.tone}>{feedback.text}</Notice>
        </div>
      )}
    </Card>
  );
}
