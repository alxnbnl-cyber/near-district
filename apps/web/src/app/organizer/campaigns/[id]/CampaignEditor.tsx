"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUnits, parseUnits } from "@yielvy/core";
import { Button, Field, Notice, buttonClass, inputClass, textareaClass } from "@/components/ui";
import { StatusBadge } from "@/components/campaign/bits";
import { GameIcon } from "@/components/host/GameIcon";
import { frame } from "@/components/explore/frame";
import { api, ApiError } from "@/lib/api";
import { QuestionsPanel, type QuestionRow } from "./QuestionsPanel";
import { SubmissionsPanel, type SubmissionRow } from "./SubmissionsPanel";

interface Rules {
  startsAt: string;
  endsAt: string;
  eligibility: { requireVerifiedPayout: boolean; maxParticipants?: number; blockedJurisdictions: string[] };
  fundingSource: "none" | "direct";
  reward: { mode: string; winnersCount: number; minPayout: string; tieBreak: string; perPersonCap?: string; rankSharesBps?: number[] };
  periods: number;
  claimWindowDays: number;
  judgingCriteria?: { key: string; label: string; weightBps: number }[];
  plannedDirectBudget?: string;
}

interface Initial {
  campaign: { id: string; title: string; slug: string; summary: string; description: string; template: string; status: string; effective: string; currentVersion: number | null };
  spaceSlug: string;
  role: string;
  questions: QuestionRow[];
  check: { ok: boolean; problems: string[]; warnings?: string[]; funding: { required: boolean; verified: boolean; detail: string } } | null;
  rules: Rules;
  submissions: SubmissionRow[];
  token: { symbol: string; decimals: number };
}

const toLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => new Date(v).toISOString();

/** Winners cap for hunts: effectively "everyone who got every clue right". */
const MAX_SPLIT = 10_000;

export function CampaignEditor({ initial }: { initial: Initial }) {
  const router = useRouter();
  const { campaign: c, token } = initial;
  const draft = c.status === "DRAFT" || c.status === "PENDING_FUNDING";
  const hunt = c.template === "treasure_hunt";
  const canEdit = ["owner", "admin", "editor"].includes(initial.role);
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState({ title: c.title, summary: c.summary, description: c.description });
  // NEAR District: every mission has a fixed prize
  const [rules, setRules] = useState<Rules>({ ...initial.rules, fundingSource: "direct" });
  const [budget, setBudget] = useState(initial.rules.plannedDirectBudget ? formatUnits(BigInt(initial.rules.plannedDirectBudget), token.decimals) : "");
  const [notice, setNotice] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>, ok: string, next?: number) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "ok", text: ok });
      if (next !== undefined) setStep(next);
      router.refresh();
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  };

  const save = (next?: number) =>
    act(
      async () => {
        let pb: bigint | undefined;
        try {
          pb = budget ? parseUnits(budget, token.decimals) : undefined;
        } catch {
          throw new ApiError(`Enter the budget in ${token.symbol}, e.g. 250 or 99.5.`, 400);
        }
        const next: Rules = {
          ...rules,
          // hunts: everyone with every clue correct splits the prize equally; contests: the company picks the winners
          reward: { ...rules.reward, mode: hunt ? "equal" : "organizer_selected", winnersCount: hunt ? MAX_SPLIT : rules.reward.winnersCount, minPayout: "0" },
          fundingSource: "direct",
          plannedDirectBudget: pb?.toString(),
          eligibility: { requireVerifiedPayout: true, blockedJurisdictions: [] },
        };
        await api(`/api/organizer/campaigns/${c.id}`, {
          method: "PATCH",
          body: draft ? { ...details, rules: next } : { ...details, rules: { endsAt: next.endsAt }, notice: notice || undefined },
        });
      },
      "Saved.",
      next,
    );

  // ------------------------------------------------------------- published: simple control room
  if (!draft) {
    return (
      <div className="flex flex-col gap-6">
        <Header c={c} spaceSlug={initial.spaceSlug} />
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div className="card-reward flex flex-wrap items-center gap-5 rounded-[22px] p-6">
          <GameIcon name="explore" size={90} className="yv-float" />
          <div className="min-w-0 flex-1">
            <p className="text-[22px] font-bold">{c.effective === "LIVE" ? "Your mission is live" : c.effective === "SCHEDULED" ? "Your mission starts soon" : "Mission status"}</p>
            <p className="text-ink-2">Ends {new Date(rules.endsAt).toLocaleString()}</p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {c.effective === "LIVE" && (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => act(() => api(`/api/organizer/campaigns/${c.id}/state`, { method: "POST", body: { to: "PAUSED" } }), "Paused.")}>
                  Pause
                </Button>
              )}
              {c.effective === "PAUSED" && (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => act(() => api(`/api/organizer/campaigns/${c.id}/state`, { method: "POST", body: { to: "LIVE" } }), "Resumed.")}>
                  Resume
                </Button>
              )}
              {["LIVE", "PAUSED"].includes(c.effective) && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={() => confirm("End this mission now? Players won't be able to continue.") && act(() => api(`/api/organizer/campaigns/${c.id}/state`, { method: "POST", body: { to: "ENDED" } }), "Ended.")}
                >
                  End now
                </Button>
              )}
            </div>
          )}
        </div>
        {canEdit && ["LIVE", "PAUSED", "SCHEDULED"].includes(c.effective) && (
          <div className="rounded-[18px] border border-line bg-card p-5">
            <p className="font-semibold">Extend the end date</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
              <input type="datetime-local" className={inputClass} value={toLocal(rules.endsAt)} onChange={(e) => setRules({ ...rules, endsAt: fromLocal(e.target.value) })} />
              <input className={inputClass} maxLength={500} value={notice} onChange={(e) => setNotice(e.target.value)} placeholder="Message to players, e.g. “We added 3 more days!”" />
              <Button disabled={busy} onClick={() => save()}>
                Save
              </Button>
            </div>
          </div>
        )}
        {hunt && (
          <div className="rounded-[18px] border border-line bg-card p-5">
            <p className="mb-3 font-semibold">Secrets</p>
            <QuestionsPanel campaignId={c.id} questions={initial.questions} editable={false} />
          </div>
        )}
        {!hunt && (
          <div className="rounded-[18px] border border-line bg-card p-5">
            <p className="mb-3 font-semibold">Entries</p>
            <SubmissionsPanel campaignId={c.id} rows={initial.submissions} criteria={rules.judgingCriteria ?? []} ended={["ENDED", "AWAITING_RESULTS", "COMPLETED"].includes(c.effective)} winnersCount={rules.reward.winnersCount} />
          </div>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------- draft: step-by-step builder
  const STEPS = [
    { label: "Story", icon: "host" as const },
    { label: hunt ? "Secrets" : "Judging", icon: hunt ? ("explore" as const) : ("play" as const) },
    { label: "Prize", icon: "earn" as const },
    { label: "Timeline & launch", icon: "explore" as const },
  ];
  const last = STEPS.length - 1;
  const funded = rules.fundingSource !== "none";
  const startMs = Date.parse(rules.startsAt), endMs = Date.parse(rules.endsAt);
  const days = Math.max(0, Math.round((endMs - startMs) / 86_400_000));
  const fmt = (ms: number) => new Date(ms).toLocaleString("en", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const setDuration = (d: number) => setRules({ ...rules, endsAt: new Date(Date.parse(rules.startsAt) + d * 86_400_000).toISOString() });
  const checks = [
    { ok: details.title.trim().length >= 3 && details.summary.trim().length > 0, label: "Story written", step: 0 },
    { ok: hunt ? initial.questions.length > 0 : (rules.judgingCriteria ?? []).length > 0, label: hunt ? `${initial.questions.length} secret${initial.questions.length === 1 ? "" : "s"} added` : "Judging set", step: 1 },
    { ok: Boolean(budget), label: budget ? `Prize ${budget} ${token.symbol}` : "Prize amount set", step: 2 },
    { ok: endMs > startMs && endMs > Date.now(), label: "Dates valid", step: 3 },
    { ok: !funded || Boolean(initial.check?.funding.verified), label: "Prize deposited on-chain", step: 3 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Header c={c} spaceSlug={initial.spaceSlug} />

      {/* stepper: one row */}
      <ol className="flex items-stretch gap-0 overflow-x-auto font-mono" aria-label="Steps">
        {STEPS.map((st, i) => {
          const now = step === i, done = i < step;
          return (
            <li key={st.label} className="flex min-w-[150px] flex-1 items-center">
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={now ? "step" : undefined}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${now ? "bg-[rgb(255_145_56/.12)]" : "hover:bg-[rgb(255_255_255/.03)]"}`}
                style={frame(10, now ? "rgb(255 145 56 / .7)" : done ? "rgb(255 145 56 / .3)" : "rgb(214 219 225 / .12)")}
              >
                <span className={`grid size-7 shrink-0 place-items-center text-[11px] font-black ${done || now ? "bg-orange text-[#140c05]" : "border border-[rgb(214_219_225/.3)] text-[rgb(214_219_225/.5)]"}`}>{done ? "✓" : i + 1}</span>
                <span className={`truncate text-[11.5px] font-bold uppercase tracking-[0.16em] ${now ? "text-orange" : done ? "text-white" : "text-[rgb(214_219_225/.55)]"}`}>{st.label}</span>
              </button>
              {i < last && <span aria-hidden className={`mx-1.5 h-px w-4 shrink-0 ${done ? "bg-orange" : "bg-[rgb(214_219_225/.2)]"}`} />}
            </li>
          );
        })}
      </ol>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <div key={step} className="yv-enter min-w-0 bg-[rgb(10_13_18/.6)] p-6 md:p-8" style={frame(16, "rgb(214 219 225 / .12)")}>
        {step === 0 && (
          <div className="flex flex-col gap-5">
            <StepTitle art={hunt ? <GameIcon name="host" size={70} /> : <GameIcon name="play" size={64} />} title="Tell the story" body="Short and exciting. This is what explorers see first." />
            <div className="grid gap-5 lg:grid-cols-2">
              <Field label="Mission name" htmlFor="title">
                <input id="title" className={`${inputClass} h-12 text-[16px]`} disabled={!canEdit} value={details.title} onChange={(e) => setDetails({ ...details, title: e.target.value })} />
              </Field>
              <Field label="One-line hook" htmlFor="summary">
                <input id="summary" className={`${inputClass} h-12`} maxLength={200} disabled={!canEdit} value={details.summary} onChange={(e) => setDetails({ ...details, summary: e.target.value })} placeholder="Follow the light to find the hidden vault." />
              </Field>
            </div>
            <Field label={hunt ? "The story (optional)" : "What are you looking for?"} htmlFor="desc">
              <textarea id="desc" className={`${textareaClass} min-h-36`} maxLength={6000} disabled={!canEdit} value={details.description} onChange={(e) => setDetails({ ...details, description: e.target.value })} />
            </Field>
            <Nav onNext={() => save(1)} busy={busy} />
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5">
            {hunt ? (
              <>
                <StepTitle art={<GameIcon name="explore" size={70} />} title="Hide your secrets" body="Players decrypt each secret by finding its answer. Add a hint they can unlock with an on-chain activity." />
                <QuestionsPanel campaignId={c.id} questions={initial.questions} editable={canEdit} />
              </>
            ) : (
              <>
                <StepTitle art={<GameIcon name="play" size={64} />} title="How will you judge?" body="Pick what matters. Weights must add up to 100%." />
                <CriteriaEditor value={rules.judgingCriteria ?? []} onChange={(v) => setRules({ ...rules, judgingCriteria: v })} editable={canEdit} />
              </>
            )}
            <Nav onBack={() => setStep(0)} onNext={() => (hunt ? setStep(2) : save(2))} busy={busy} />
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5">
            <StepTitle art={<GameIcon name="earn" size={70} />} title="Set the prize" body="A fixed prize, paid in full at the deadline." />
            <div className="grid gap-5 lg:grid-cols-2">
              <Field label={`Prize (${token.symbol})`} htmlFor="budget">
                <input id="budget" inputMode="decimal" className={`${inputClass} h-14 text-[22px] font-semibold`} disabled={!canEdit} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="100" />
              </Field>
              {!hunt && (
                <Field label="Number of winners" htmlFor="winners" hint="Your team picks them; they share the prize equally.">
                  <input id="winners" type="number" min={1} max={1000} className={`${inputClass} h-14 text-[22px] font-semibold`} disabled={!canEdit} value={rules.reward.winnersCount} onChange={(e) => setRules({ ...rules, reward: { ...rules.reward, winnersCount: Math.max(1, Number(e.target.value) || 1) } })} />
                </Field>
              )}
            </div>
            {hunt && <p className="border-l-2 border-gold pl-4 text-[14px] text-ink-2">At the deadline, <strong className="text-ink">everyone who decrypted every secret correctly splits this prize equally</strong>, paid straight to their NEAR wallet.</p>}
            <p className="text-[12.5px] text-ink-3">You&apos;ll deposit the prize under Prize funding. Players only see a prize amount once it&apos;s confirmed on-chain.</p>
            <Nav onBack={() => setStep(1)} onNext={() => save(3)} busy={busy} />
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-6">
            <StepTitle art={<GameIcon name="explore" size={64} />} title="Timeline & launch" body="Pick when it opens and how long it runs. Answers lock at the deadline; winners are paid right after." />

            {/* timeline: two dates and a visual track */}
            <div className="grid gap-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
              <Field label="Opens" htmlFor="start">
                <input id="start" type="datetime-local" className={`${inputClass} h-12`} disabled={!canEdit} value={toLocal(rules.startsAt)} onChange={(e) => setRules({ ...rules, startsAt: fromLocal(e.target.value) })} />
              </Field>
              <Field label="Deadline" htmlFor="end">
                <input id="end" type="datetime-local" className={`${inputClass} h-12`} disabled={!canEdit} value={toLocal(rules.endsAt)} onChange={(e) => setRules({ ...rules, endsAt: fromLocal(e.target.value) })} />
              </Field>
              <div className="flex gap-1.5 font-mono">
                {[3, 7, 14, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setDuration(d)}
                    className={`h-12 px-3 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${days === d ? "bg-[rgb(255_145_56/.15)] text-orange" : "text-[rgb(214_219_225/.65)] hover:text-white"}`}
                    style={frame(8, days === d ? "rgb(255 145 56 / .6)" : "rgb(214 219 225 / .18)")}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[rgb(255_255_255/.025)] px-5 py-5 font-mono" style={frame(12, "rgb(214 219 225 / .1)")}>
              <div className="relative grid grid-cols-3 gap-2">
                <span aria-hidden className="absolute left-[8px] right-[8px] top-[7px] h-[2px] bg-[linear-gradient(90deg,#FF9138,#FFC24B,#34d399)]" />
                {[
                  ["Opens", Number.isFinite(startMs) ? fmt(startMs) : "—", "#FF9138", "Players can start"],
                  ["Deadline", Number.isFinite(endMs) ? fmt(endMs) : "—", "#FFC24B", "Answers lock, results revealed"],
                  ["Paid", "Right after", "#34d399", hunt ? "Split by everyone correct" : "To the winners you pick"],
                ].map(([k, v, color, note], i) => (
                  <div key={k} className={`relative flex flex-col ${i === 1 ? "items-center text-center" : i === 2 ? "items-end text-right" : ""}`}>
                    <span className="size-4 rounded-full border-2 border-[#0a0d12]" style={{ background: color }} />
                    <span className="mt-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.5)]">{k}</span>
                    <span className="mt-1 text-[13px] font-bold text-white">{v}</span>
                    <span className="mt-0.5 font-sans text-[12px] text-[rgb(214_219_225/.5)]">{note}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-orange">{days > 0 ? `Runs for ${days} day${days === 1 ? "" : "s"}` : endMs > startMs ? "Runs for less than a day" : "The deadline must be after the opening"}</p>
            </div>

            {canEdit && (
              <div>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => save()}>
                  Save dates
                </Button>
              </div>
            )}

            {/* launch checklist */}
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.55)]">Launch checklist</p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {checks.map((k) => (
                    <li key={k.label}>
                      <button type="button" onClick={() => setStep(k.step)} className="flex w-full items-center gap-3 bg-[rgb(255_255_255/.025)] px-3 py-2.5 text-left hover:bg-[rgb(255_255_255/.05)]" style={frame(8, k.ok ? "rgb(52 211 153 / .35)" : "rgb(255 194 75 / .35)")}>
                        <span className={`grid size-6 shrink-0 place-items-center text-[11px] font-black ${k.ok ? "bg-mint text-[#062016]" : "border border-gold text-gold"}`}>{k.ok ? "✓" : "!"}</span>
                        <span className={`text-[13.5px] ${k.ok ? "text-white" : "text-[rgb(214_219_225/.75)]"}`}>{k.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {initial.check && !initial.check.ok && (
                  <ul className="mt-3 space-y-1 text-[13px] text-ink-3">
                    {initial.check.problems.map((p) => (
                      <li key={p}>• {p}</li>
                    ))}
                  </ul>
                )}
                {initial.check?.warnings?.map((w) => (
                  <p key={w} className="mt-2 text-[12.5px] text-ink-3">{w}</p>
                ))}
                {funded && initial.check && !initial.check.funding.verified && (
                  <Link href="/organizer/funding" className={buttonClass("dark", "sm", "mt-3")}>
                    Go to prize funding →
                  </Link>
                )}
              </div>
              <div className="flex flex-col items-stretch gap-2 lg:items-end">
                <Button
                  size="lg"
                  className={`h-14 px-8 ${initial.check?.ok ? "yv-glow" : ""}`}
                  disabled={busy || !initial.check?.ok || !["owner", "admin"].includes(initial.role)}
                  onClick={() => act(() => api(`/api/organizer/campaigns/${c.id}/publish`, { method: "POST" }), "Published! Your mission is on the map.")}
                >
                  Publish mission 🚀
                </Button>
                <Button variant="ghost" onClick={() => setStep(2)}>
                  ← Back
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Header({ c, spaceSlug }: { c: Initial["campaign"]; spaceSlug: string }) {
  const draft = c.status === "DRAFT" || c.status === "PENDING_FUNDING";
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <StatusBadge status={c.effective as never} />
          <Link href="/organizer/campaigns" className="text-[13px] text-ink-3 hover:text-ink">
            ← All missions
          </Link>
        </div>
        <h1 className="mt-2 text-[28px] font-bold tracking-[-0.02em]">{c.title}</h1>
      </div>
      {!draft && (
        <Link href={`/s/${spaceSlug}/c/${c.slug}`} className={buttonClass("secondary", "sm")}>
          View as player
        </Link>
      )}
    </div>
  );
}

function StepTitle({ art, title, body }: { art: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="grid size-20 shrink-0 place-items-center">{art}</span>
      <div>
        <h2 className="text-[22px] font-bold">{title}</h2>
        <p className="text-[14px] text-ink-2">{body}</p>
      </div>
    </div>
  );
}

function Nav({ onBack, onNext, busy }: { onBack?: () => void; onNext: () => void; busy: boolean }) {
  return (
    <div className="mt-2 flex items-center gap-3">
      {onBack && (
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
      )}
      <Button onClick={onNext} disabled={busy}>
        {busy ? "Saving…" : "Save & continue →"}
      </Button>
    </div>
  );
}

function CriteriaEditor({ value, onChange, editable }: { value: { key: string; label: string; weightBps: number }[]; onChange: (v: { key: string; label: string; weightBps: number }[]) => void; editable: boolean }) {
  const total = value.reduce((a, b) => a + b.weightBps, 0);
  return (
    <div className="flex flex-col gap-3">
      {value.map((k, i) => (
        <div key={i} className="grid grid-cols-[1fr_110px_auto] items-end gap-2">
          <Field label={i === 0 ? "What you score" : ""} htmlFor={`k${i}`}>
            <input
              id={`k${i}`}
              className={inputClass}
              disabled={!editable}
              value={k.label}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, label: e.target.value, key: x.key || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24) } : x)))}
            />
          </Field>
          <Field label={i === 0 ? "Weight %" : ""} htmlFor={`w${i}`}>
            <input id={`w${i}`} type="number" min={1} max={100} className={inputClass} disabled={!editable} value={k.weightBps / 100} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, weightBps: Math.round(Number(e.target.value) * 100) } : x)))} />
          </Field>
          {editable && (
            <Button variant="ghost" size="sm" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${k.label}`}>
              Remove
            </Button>
          )}
        </div>
      ))}
      <div className="flex items-center gap-3">
        {editable && value.length < 8 && (
          <Button variant="secondary" size="sm" onClick={() => onChange([...value, { key: `criterion_${value.length + 1}`, label: "", weightBps: 1000 }])}>
            + Add
          </Button>
        )}
        <span className={`text-[13px] font-semibold ${total === 10_000 ? "text-mint-ink" : "text-danger"}`}>Total {total / 100}%</span>
      </div>
    </div>
  );
}
