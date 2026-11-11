"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUnits, parseUnits } from "@yielvy/core";
import { Button, Field, Notice, buttonClass, inputClass, textareaClass } from "@/components/ui";
import { StatusBadge } from "@/components/campaign/bits";
import { GameIcon } from "@/components/host/GameIcon";
import { api, ApiError } from "@/lib/api";
import { QuestionsPanel, type QuestionRow } from "./QuestionsPanel";
import { SubmissionsPanel, type SubmissionRow } from "./SubmissionsPanel";
import { EconomicsPanel } from "./EconomicsPanel";

interface Rules {
  startsAt: string;
  endsAt: string;
  eligibility: { requireVerifiedPayout: boolean; maxParticipants?: number; blockedJurisdictions: string[] };
  fundingSource: "none" | "yield" | "direct" | "both";
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

export function CampaignEditor({ initial }: { initial: Initial }) {
  const router = useRouter();
  const { campaign: c, token } = initial;
  const draft = c.status === "DRAFT" || c.status === "PENDING_FUNDING";
  const hunt = c.template === "treasure_hunt";
  const canEdit = ["owner", "admin", "editor"].includes(initial.role);
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState({ title: c.title, summary: c.summary, description: c.description });
  const [rules, setRules] = useState<Rules>({ ...initial.rules, fundingSource: initial.rules.fundingSource === "yield" ? "yield" : initial.rules.fundingSource === "none" ? "none" : "direct" });
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
          pb = rules.fundingSource === "direct" && budget ? parseUnits(budget, token.decimals) : undefined;
        } catch {
          throw new ApiError(`Enter the budget in ${token.symbol}, e.g. 250 or 99.5.`, 400);
        }
        const next: Rules = {
          ...rules,
          reward: { ...rules.reward, mode: hunt ? "equal" : "organizer_selected", minPayout: "0" },
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
            <p className="mb-3 font-semibold">Clues</p>
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

  // ------------------------------------------------------------- draft: four-step builder
  const STEPS = ["Story", hunt ? "Clues" : "Judging", "Prize", "Launch"];
  const funded = rules.fundingSource !== "none";

  return (
    <div className="flex flex-col gap-6">
      <Header c={c} spaceSlug={initial.spaceSlug} />

      {/* stepper */}
      <ol className="grid grid-cols-4 gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => setStep(i)}
              aria-current={step === i ? "step" : undefined}
              className={`flex w-full items-center gap-2 rounded-[14px] border px-3 py-2.5 text-left transition-all ${step === i ? "border-orange bg-orange-wash" : i < step ? "border-orange/30 bg-card" : "border-line bg-card hover:border-line-strong"}`}
            >
              <span className={`grid size-7 shrink-0 place-items-center rounded-full font-display text-[13px] font-bold ${i < step ? "bg-orange text-[#140c05]" : step === i ? "bg-orange text-[#140c05]" : "bg-paper-2 text-ink-3"}`}>{i < step ? "✓" : i + 1}</span>
              <span className={`truncate text-[13.5px] font-semibold ${step === i ? "text-orange-ink" : "text-ink-2"}`}>{s}</span>
            </button>
          </li>
        ))}
      </ol>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div key={step} className="yv-enter min-w-0 rounded-[22px] border border-line bg-card p-6">
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <StepTitle art={hunt ? <GameIcon name="host" size={70} /> : <GameIcon name="play" size={64} />} title="Tell the story" body="Short and exciting. This is what explorers see first." />
              <Field label="Mission name" htmlFor="title">
                <input id="title" className={`${inputClass} h-12 text-[16px]`} disabled={!canEdit} value={details.title} onChange={(e) => setDetails({ ...details, title: e.target.value })} />
              </Field>
              <Field label="One-line hook" htmlFor="summary">
                <input id="summary" className={inputClass} maxLength={200} disabled={!canEdit} value={details.summary} onChange={(e) => setDetails({ ...details, summary: e.target.value })} placeholder="Follow the light to find the hidden vault." />
              </Field>
              <Field label={hunt ? "Intro (optional)" : "What are you looking for?"} htmlFor="desc">
                <textarea id="desc" className={`${textareaClass} min-h-28`} maxLength={6000} disabled={!canEdit} value={details.description} onChange={(e) => setDetails({ ...details, description: e.target.value })} />
              </Field>
              <Nav onNext={() => save(1)} busy={busy} />
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              {hunt ? (
                <>
                  <StepTitle art={<GameIcon name="host" size={70} />} title="Add your clues" body="Each clue is a question with one answer. Add a hint to any clue if you like." />
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
            <div className="flex flex-col gap-4">
              <StepTitle art={<GameIcon name="earn" size={70} />} title="Set the prize" body="This is what gets explorers excited." />
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Prize type">
                {(
                  [
                    ["direct", "Prize budget", "You put up a fixed prize. Simple and exciting.", <GameIcon key="c" name="earn" size={64} />],
                    ["yield", "Interest prize", "Deposit funds; the interest they earn becomes the prize. You keep your deposit.", <GameIcon key="s" name="earn" size={60} />],
                  ] as const
                ).map(([v, label, help, art]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={rules.fundingSource === v}
                    disabled={!canEdit}
                    onClick={() => setRules({ ...rules, fundingSource: v })}
                    className={`flex flex-col items-start rounded-[18px] border p-4 text-left transition-all hover:-translate-y-0.5 ${rules.fundingSource === v ? "card-reward" : "border-line bg-paper hover:border-line-strong"}`}
                  >
                    {art}
                    <span className="mt-2 font-display text-[16px] font-bold">{label}</span>
                    <span className="mt-0.5 text-[13px] text-ink-2">{help}</span>
                  </button>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {rules.fundingSource === "direct" && (
                  <Field label={`Prize amount (${token.symbol})`} htmlFor="budget">
                    <input id="budget" inputMode="decimal" className={`${inputClass} h-12 text-[18px] font-semibold`} disabled={!canEdit} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="250" />
                  </Field>
                )}
                <Field label="Number of winners" htmlFor="winners" hint={hunt ? "They share the prize equally." : "Your team picks them."}>
                  <input id="winners" type="number" min={1} max={1000} className={`${inputClass} h-12 text-[18px] font-semibold`} disabled={!canEdit} value={rules.reward.winnersCount} onChange={(e) => setRules({ ...rules, reward: { ...rules.reward, winnersCount: Math.max(1, Number(e.target.value) || 1) } })} />
                </Field>
              </div>
              {rules.fundingSource === "yield" && <EconomicsPanel periods={1} winners={rules.reward.winnersCount} minPayout="0" budget="" token={token} />}
              <p className="text-[12.5px] text-ink-3">You&apos;ll deposit the prize under Prize funding. Players only see a prize amount once it&apos;s confirmed on-chain.</p>
              <Nav onBack={() => setStep(1)} onNext={() => save(3)} busy={busy} />
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <StepTitle art={<GameIcon name="explore" size={64} />} title="Launch" body="Pick the dates, then publish." />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Starts" htmlFor="start">
                  <input id="start" type="datetime-local" className={inputClass} disabled={!canEdit} value={toLocal(rules.startsAt)} onChange={(e) => setRules({ ...rules, startsAt: fromLocal(e.target.value) })} />
                </Field>
                <Field label="Ends" htmlFor="end">
                  <input id="end" type="datetime-local" className={inputClass} disabled={!canEdit} value={toLocal(rules.endsAt)} onChange={(e) => setRules({ ...rules, endsAt: fromLocal(e.target.value) })} />
                </Field>
              </div>
              {canEdit && (
                <div>
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => save()}>
                    Save dates
                  </Button>
                </div>
              )}
              {initial.check && (
                <div className="rounded-[16px] border border-line bg-paper p-4">
                  <p className="font-semibold">{initial.check.ok ? "✓ Ready to go" : "Almost there"}</p>
                  {!initial.check.ok && (
                    <ul className="mt-2 space-y-1.5 text-[13.5px]">
                      {initial.check.problems.map((p) => (
                        <li key={p} className="flex gap-2 text-ink-2">
                          <span className="text-gold">○</span>
                          {p}
                        </li>
                      ))}
                    </ul>
                  )}
                  {initial.check.warnings?.map((w) => (
                    <p key={w} className="mt-2 text-[12.5px] text-ink-3">
                      {w}
                    </p>
                  ))}
                  {funded && !initial.check.funding.verified && (
                    <Link href="/organizer/funding" className={buttonClass("dark", "sm", "mt-3")}>
                      Go to prize funding →
                    </Link>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={() => setStep(2)}>
                  ← Back
                </Button>
                <Button
                  size="lg"
                  className={initial.check?.ok ? "yv-glow" : ""}
                  disabled={busy || !initial.check?.ok || !["owner", "admin"].includes(initial.role)}
                  onClick={() => act(() => api(`/api/organizer/campaigns/${c.id}/publish`, { method: "POST" }), "Published! Your mission is on the map.")}
                >
                  Publish mission 🚀
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* live preview */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-3">Live preview</p>
          <div className={`relative overflow-hidden rounded-[20px] p-5 ${funded ? "card-reward" : "border border-line bg-card"}`}>
            <div className="pointer-events-none absolute -right-4 -top-2">{hunt ? <GameIcon name="earn" size={100} className="yv-float" /> : <GameIcon name="play" size={90} className="yv-float" />}</div>
            <p className={`text-[10.5px] font-bold uppercase tracking-[0.14em] ${hunt ? "text-sky" : "text-violet-ink"}`}>{hunt ? "Mission" : "Challenge"}</p>
            <p className="mt-1 max-w-[70%] font-display text-[19px] font-bold leading-tight">{details.title || "Your mission"}</p>
            {details.summary && <p className="mt-1 max-w-[80%] text-[12.5px] text-ink-2">{details.summary}</p>}
            <div className="mt-4">
              {funded ? (
                <span className="yv-shine inline-flex items-center gap-1.5 rounded-full bg-reward px-3 py-1 font-display text-[14px] font-bold text-[#2a1600]">
                  🏆 {rules.fundingSource === "direct" ? (budget ? `${budget} ${token.symbol}` : "Prize budget") : "Interest prize"}
                </span>
              ) : (
                <span className="rounded-full bg-paper-2 px-2.5 py-1 text-[12px] text-ink-3">Just for fun</span>
              )}
            </div>
            <p className="mt-3 text-[12px] text-ink-3">
              {hunt ? `${initial.questions.length} clue${initial.questions.length === 1 ? "" : "s"}` : `${(rules.judgingCriteria ?? []).length} criteria`} · {rules.reward.winnersCount} winner{rules.reward.winnersCount === 1 ? "" : "s"}
            </p>
          </div>
        </aside>
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
      <span className="grid size-20 shrink-0 place-items-center rounded-[16px] bg-paper">{art}</span>
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
