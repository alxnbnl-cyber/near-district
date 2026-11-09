"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUnits, parseUnits } from "@yielvy/core";
import { Badge, Button, Card, Field, Notice, buttonClass, inputClass, textareaClass } from "@/components/ui";
import { StatusBadge, TEMPLATE_LABEL } from "@/components/campaign/bits";
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
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => new Date(v).toISOString();

export function CampaignEditor({ initial }: { initial: Initial }) {
  const router = useRouter();
  const { campaign: c, token } = initial;
  const draft = c.status === "DRAFT" || c.status === "PENDING_FUNDING";
  const canEdit = ["owner", "admin", "editor"].includes(initial.role);
  const [details, setDetails] = useState({ title: c.title, summary: c.summary, description: c.description });
  const [rules, setRules] = useState<Rules>(initial.rules);
  const [minPayout, setMinPayout] = useState(formatUnits(BigInt(initial.rules.reward.minPayout || "0"), token.decimals));
  const [budget, setBudget] = useState(initial.rules.plannedDirectBudget ? formatUnits(BigInt(initial.rules.plannedDirectBudget), token.decimals) : "");
  const [blocked, setBlocked] = useState(initial.rules.eligibility.blockedJurisdictions.join(", "));
  const [notice, setNotice] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "ok", text: ok });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    act(async () => {
      let mp: bigint, pb: bigint | undefined;
      try {
        mp = parseUnits(minPayout || "0", token.decimals);
        pb = budget ? parseUnits(budget, token.decimals) : undefined;
      } catch {
        throw new ApiError(`Amounts must be ${token.symbol} values with at most ${token.decimals} decimals.`, 400);
      }
      const next: Rules = {
        ...rules,
        reward: { ...rules.reward, minPayout: mp.toString() },
        plannedDirectBudget: pb?.toString(),
        eligibility: {
          ...rules.eligibility,
          blockedJurisdictions: blocked
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter((s) => /^[A-Z]{2}$/.test(s)),
        },
      };
      await api(`/api/organizer/campaigns/${c.id}`, {
        method: "PATCH",
        body: draft ? { ...details, rules: next } : { ...details, rules: { endsAt: next.endsAt }, notice: notice || undefined },
      });
    }, "Saved.");

  const setReward = (patch: Partial<Rules["reward"]>) => setRules((r) => ({ ...r, reward: { ...r.reward, ...patch } }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <StatusBadge status={c.effective as never} />
            <span className="text-[13px] text-ink-3">{TEMPLATE_LABEL[c.template]}</span>
            {c.currentVersion && <Badge>Rules v{c.currentVersion}</Badge>}
          </div>
          <h1 className="mt-2 text-2xl font-semibold">{c.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {!draft && (
            <Link href={`/s/${initial.spaceSlug}/c/${c.slug}`} className={buttonClass("secondary", "sm")}>
              View public page
            </Link>
          )}
          {!draft && c.effective === "LIVE" && canEdit && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => act(() => api(`/api/organizer/campaigns/${c.id}/state`, { method: "POST", body: { to: "PAUSED" } }), "Paused.")}>
              Pause
            </Button>
          )}
          {!draft && c.effective === "PAUSED" && canEdit && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => act(() => api(`/api/organizer/campaigns/${c.id}/state`, { method: "POST", body: { to: "LIVE" } }), "Resumed.")}>
              Resume
            </Button>
          )}
          {!draft && ["LIVE", "PAUSED"].includes(c.effective) && canEdit && (
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => confirm("End this campaign now? Participants won't be able to continue.") && act(() => api(`/api/organizer/campaigns/${c.id}/state`, { method: "POST", body: { to: "ENDED" } }), "Ended.")}
            >
              End now
            </Button>
          )}
        </div>
      </div>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <Section title="Details" step={1}>
        <Field label="Title" htmlFor="title">
          <input id="title" className={inputClass} disabled={!canEdit} value={details.title} onChange={(e) => setDetails({ ...details, title: e.target.value })} />
        </Field>
        <Field label="Summary" htmlFor="summary" hint="One or two sentences for cards and previews.">
          <input id="summary" className={inputClass} maxLength={200} disabled={!canEdit} value={details.summary} onChange={(e) => setDetails({ ...details, summary: e.target.value })} />
        </Field>
        <Field label={c.template === "creative_contest" ? "Brief" : "Introduction"} htmlFor="desc" hint="What participants should know before they start. Plain text.">
          <textarea id="desc" className={`${textareaClass} min-h-40`} maxLength={6000} disabled={!canEdit} value={details.description} onChange={(e) => setDetails({ ...details, description: e.target.value })} />
        </Field>
      </Section>

      <Section title="Schedule & eligibility" step={2}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts" htmlFor="start">
            <input id="start" type="datetime-local" className={inputClass} disabled={!draft || !canEdit} value={toLocal(rules.startsAt)} onChange={(e) => setRules({ ...rules, startsAt: fromLocal(e.target.value) })} />
          </Field>
          <Field label="Ends" htmlFor="end" hint={draft ? undefined : "After publishing you can only extend the end date."}>
            <input id="end" type="datetime-local" className={inputClass} disabled={!canEdit} value={toLocal(rules.endsAt)} onChange={(e) => setRules({ ...rules, endsAt: fromLocal(e.target.value) })} />
          </Field>
        </div>
        {draft && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Participant limit (optional)" htmlFor="max">
              <input
                id="max"
                type="number"
                min={1}
                className={inputClass}
                value={rules.eligibility.maxParticipants ?? ""}
                onChange={(e) => setRules({ ...rules, eligibility: { ...rules.eligibility, maxParticipants: e.target.value ? Number(e.target.value) : undefined } })}
              />
            </Field>
            <Field label="Excluded countries" htmlFor="blocked" hint="Two-letter codes, comma separated (e.g. US, GB).">
              <input id="blocked" className={inputClass} value={blocked} onChange={(e) => setBlocked(e.target.value)} />
            </Field>
          </div>
        )}
        {!draft && (
          <Field label="Notice to participants (required if people have joined)" htmlFor="notice">
            <input id="notice" className={inputClass} maxLength={500} value={notice} onChange={(e) => setNotice(e.target.value)} placeholder="We extended the hunt by three days." />
          </Field>
        )}
      </Section>

      <Section title="Rewards" step={3}>
        <fieldset disabled={!draft || !canEdit} className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-semibold">Where do rewards come from?</legend>
          {(
            [
              ["none", "No token rewards", "Just for fun and recognition. Nothing is paid out."],
              ["direct", "Direct reward budget", "You deposit a fixed reward budget into the vault up front."],
              ["yield", "Lending yield only", "Your deposit earns variable interest; only collected interest becomes rewards."],
              ["both", "Budget + yield", "A guaranteed budget, topped up by any interest actually collected."],
            ] as const
          ).map(([v, label, help]) => (
            <label key={v} className={`flex cursor-pointer gap-3 rounded-md border px-4 py-3 ${rules.fundingSource === v ? "border-orange-deep bg-orange-wash" : "border-line"}`}>
              <input type="radio" name="funding" className="mt-1 accent-[var(--color-orange-deep)]" checked={rules.fundingSource === v} onChange={() => setRules({ ...rules, fundingSource: v })} />
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-[13px] text-ink-2">{help}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {rules.fundingSource !== "none" && (
          <div className="mt-2 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Mechanism" htmlFor="mode">
                <select id="mode" className={inputClass} disabled={!draft} value={rules.reward.mode} onChange={(e) => setReward({ mode: e.target.value })}>
                  <option value="equal">Equal split</option>
                  <option value="top_scorers">Top scorers</option>
                  {c.template === "creative_contest" && <option value="organizer_selected">Organizer selected</option>}
                  <option value="random_draw">Random draw (restricted)</option>
                </select>
              </Field>
              <Field label="Winners per period" htmlFor="winners">
                <input id="winners" type="number" min={1} className={inputClass} disabled={!draft} value={rules.reward.winnersCount} onChange={(e) => setReward({ winnersCount: Number(e.target.value) })} />
              </Field>
              <Field label="Reward periods" htmlFor="periods" hint="Each period settles and pays separately.">
                <input id="periods" type="number" min={1} max={365} className={inputClass} disabled={!draft} value={rules.periods} onChange={(e) => setRules({ ...rules, periods: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={`Minimum payout (${token.symbol})`} htmlFor="minp" hint="Smaller rewards are not paid.">
                <input id="minp" inputMode="decimal" className={inputClass} disabled={!draft} value={minPayout} onChange={(e) => setMinPayout(e.target.value)} />
              </Field>
              {rules.fundingSource !== "yield" && (
                <Field label={`Planned budget (${token.symbol})`} htmlFor="budget" hint="Publishing checks this is deposited.">
                  <input id="budget" inputMode="decimal" className={inputClass} disabled={!draft} value={budget} onChange={(e) => setBudget(e.target.value)} />
                </Field>
              )}
              <Field label="Claim window (days)" htmlFor="claimw">
                <input id="claimw" type="number" min={7} className={inputClass} disabled={!draft} value={rules.claimWindowDays} onChange={(e) => setRules({ ...rules, claimWindowDays: Number(e.target.value) })} />
              </Field>
            </div>
            {rules.reward.mode === "random_draw" && (
              <Notice tone="warn" title="Random draws are legally restricted">
                Prize draws are regulated in many places. They stay disabled until Yielvy has cleared at least one jurisdiction, and are never offered where participation would require payment.
              </Notice>
            )}
            {rules.fundingSource !== "direct" && <EconomicsPanel periods={rules.periods} winners={rules.reward.winnersCount} minPayout={minPayout} budget={budget} token={token} />}
          </div>
        )}
      </Section>

      {c.template === "treasure_hunt" ? (
        <Section title="Questions" step={4}>
          <QuestionsPanel campaignId={c.id} questions={initial.questions} editable={draft && canEdit} />
        </Section>
      ) : (
        <Section title="Judging criteria" step={4}>
          <CriteriaEditor value={rules.judgingCriteria ?? []} onChange={(v) => setRules({ ...rules, judgingCriteria: v })} editable={draft && canEdit} />
        </Section>
      )}

      {canEdit && (
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy}>
            Save changes
          </Button>
        </div>
      )}

      {draft && initial.check && (
        <Section title="Review & publish" step={5}>
          {initial.check.ok ? (
            <Notice tone="ok" title="Ready to publish">
              {initial.check.funding.detail}
            </Notice>
          ) : (
            <Notice tone="warn" title="Before you can publish">
              <ul className="mt-1 list-disc pl-5">
                {initial.check.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Notice>
          )}
          {initial.check.warnings?.length ? (
            <Notice tone="info" title="Worth a look">
              <ul className="mt-1 list-disc pl-5">
                {initial.check.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
          <p className="text-[13px] text-ink-2">
            Publishing freezes the rules as version 1. After people join, changes that could disadvantage them are blocked; you'll only be able to extend the end date.
          </p>
          <div>
            <Button
              size="lg"
              disabled={busy || !initial.check.ok || !["owner", "admin"].includes(initial.role)}
              onClick={() => act(() => api(`/api/organizer/campaigns/${c.id}/publish`, { method: "POST" }), "Published.")}
            >
              Publish campaign
            </Button>
          </div>
        </Section>
      )}

      {!draft && c.template === "creative_contest" && (
        <Section title="Submissions" step={5}>
          <SubmissionsPanel campaignId={c.id} rows={initial.submissions} criteria={rules.judgingCriteria ?? []} ended={["ENDED", "AWAITING_RESULTS", "COMPLETED"].includes(c.effective)} winnersCount={rules.reward.winnersCount} />
        </Section>
      )}
    </div>
  );
}

function Section({ title, step, children }: { title: string; step: number; children: React.ReactNode }) {
  return (
    <Card as="section" className="p-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <span className="grid size-6 place-items-center rounded-full bg-paper-2 font-display text-[12px] font-bold text-ink-2">{step}</span>
        {title}
      </h2>
      <div className="flex flex-col gap-4">{children}</div>
    </Card>
  );
}

function CriteriaEditor({ value, onChange, editable }: { value: { key: string; label: string; weightBps: number }[]; onChange: (v: { key: string; label: string; weightBps: number }[]) => void; editable: boolean }) {
  const total = value.reduce((a, b) => a + b.weightBps, 0);
  return (
    <div className="flex flex-col gap-3">
      {value.map((k, i) => (
        <div key={i} className="grid grid-cols-[1fr_110px_auto] items-end gap-2">
          <Field label={i === 0 ? "Criterion" : ""} htmlFor={`k${i}`}>
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
            Add criterion
          </Button>
        )}
        <span className={`text-[13px] font-semibold ${total === 10_000 ? "text-mint-ink" : "text-danger"}`}>Total {total / 100}%</span>
      </div>
    </div>
  );
}
