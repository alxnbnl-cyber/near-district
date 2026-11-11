"use client";

import { useCallback, useEffect, useState } from "react";
import { describeActivity, hasFreePath, toTokenUnits, type ActivityDef, type ActivityToken, type RuleNode } from "@yielvy/core";
import { Badge, Button, Field, Notice, inputClass, textareaClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface CatalogueItem {
  type: ActivityDef["type"] | string;
  category: "internal" | "onchain" | "partner_app" | "manual";
  label: string;
  description: string;
  available: boolean;
  unavailableReason?: string;
  financial: boolean;
}
interface Offering {
  id: string;
  title: string;
  description: string;
  activity: ActivityDef;
  label: string;
  org: { id: string; name: string; spaceSlug: string | null };
}
export interface Options {
  catalogue: CatalogueItem[];
  ownCampaigns: { id: string; title: string; template: string; status: string }[];
  partnerOfferings: Offering[];
  tokens: ActivityToken[];
  network: "mainnet" | "testnet";
  onchainEnabled: boolean;
}
export interface HintRow {
  id: string;
  questionId: string;
  title: string;
  teaser: string;
  content: string;
  unlock: RuleNode | null;
  availableFrom: string | null;
  availableUntil: string | null;
  withdrawalPolicy: "disable" | "free";
  availability: { state: string; freeByPolicy: boolean };
  requirements: { id: string; label: string; type: string; partner: boolean }[];
  freePath: boolean;
}

/** Shared data for every question's hint section. */
export function useHintData(campaignId: string) {
  const [hints, setHints] = useState<HintRow[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  const reload = useCallback(async () => {
    const [h, o] = await Promise.all([api<HintRow[]>(`/api/organizer/campaigns/${campaignId}/hints`), api<Options>(`/api/organizer/campaigns/${campaignId}/hint-options`)]);
    setHints(h);
    setOptions(o);
  }, [campaignId]);
  useEffect(() => {
    void reload().catch(() => undefined);
  }, [reload]);
  return { hints, options, reload };
}

const GROUPS: { id: CatalogueItem["category"]; label: string }[] = [
  { id: "internal", label: "Internal" },
  { id: "onchain", label: "On-chain" },
  { id: "partner_app", label: "Partner app" },
  { id: "manual", label: "Manual review" },
];

let leafSeq = 0;
const newLeafId = () => `r${Date.now().toString(36).slice(-4)}${(leafSeq++).toString(36)}`;

type Leaf = Extract<RuleNode, { kind: "activity" }>;

export function QuestionHints({ campaignId, questionId, editable, data }: { campaignId: string; questionId: string; editable: boolean; data: ReturnType<typeof useHintData> }) {
  const mine = data.hints.filter((h) => h.questionId === questionId);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3 rounded-md border border-dashed border-line-strong px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">Hints {mine.length ? `(${mine.length})` : ""}</p>
        {editable && editing === null && mine.length < 4 && (
          <Button size="sm" variant="ghost" onClick={() => setEditing("new")}>
            + Add hint
          </Button>
        )}
      </div>
      {mine.length === 0 && editing === null && <p className="text-[12.5px] text-ink-3">No hints. Players can still answer directly.</p>}
      <ul className="mt-1 flex flex-col gap-2">
        {mine.map((h) =>
          editing === h.id ? (
            <li key={h.id}>
              <HintForm campaignId={campaignId} questionId={questionId} existing={h} options={data.options} onDone={async () => { setEditing(null); await data.reload(); }} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={h.id} className="rounded-md bg-card px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium">{h.title}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {h.unlock ? <Badge tone="orange">{h.requirements.length} activit{h.requirements.length === 1 ? "y" : "ies"}</Badge> : <Badge tone="sky">Free</Badge>}
                    {h.requirements.some((r) => r.partner) && <Badge tone="violet">Partner</Badge>}
                    {h.availability.state === "partner_withdrawn" && <Badge tone="danger">Partner withdrew</Badge>}
                    {!h.freePath && <Badge tone="gold">No free path</Badge>}
                  </div>
                  {h.requirements.length > 0 && (
                    <ul className="mt-1.5 text-[12.5px] text-ink-3">
                      {h.requirements.map((r) => (
                        <li key={r.id}>• {r.label}</li>
                      ))}
                    </ul>
                  )}
                </div>
                {editable && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(h.id)}>Edit</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm("Delete this hint?")) return;
                        try {
                          await api(`/api/organizer/campaigns/${campaignId}/hints/${h.id}`, { method: "DELETE" });
                          await data.reload();
                        } catch (e) {
                          setError(e instanceof ApiError ? e.message : "Could not delete.");
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ),
        )}
      </ul>
      {editing === "new" && <HintForm campaignId={campaignId} questionId={questionId} options={data.options} onDone={async () => { setEditing(null); await data.reload(); }} onCancel={() => setEditing(null)} />}
      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}

const toLocal = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

function HintForm({ campaignId, questionId, existing, options, onDone, onCancel }: { campaignId: string; questionId: string; existing?: HintRow; options: Options | null; onDone(): void; onCancel(): void }) {
  const initialLeaves: Leaf[] = existing?.unlock ? (existing.unlock.kind === "group" ? (existing.unlock.children as Leaf[]) : [existing.unlock as Leaf]) : [];
  const [title, setTitle] = useState(existing?.title ?? "");
  const [teaser, setTeaser] = useState(existing?.teaser ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [mode, setMode] = useState<"free" | "activities">(existing?.unlock ? "activities" : "free");
  const [op, setOp] = useState<"ANY" | "ALL">(existing?.unlock?.kind === "group" ? existing.unlock.op : "ANY");
  const [reqs, setReqs] = useState<Leaf[]>(initialLeaves);
  const [policy, setPolicy] = useState<"disable" | "free">(existing?.withdrawalPolicy ?? "disable");
  const [from, setFrom] = useState(toLocal(existing?.availableFrom ?? null));
  const [until, setUntil] = useState(toLocal(existing?.availableUntil ?? null));
  const [picking, setPicking] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rule: RuleNode | null = mode === "free" || reqs.length === 0 ? null : { kind: "group", op, children: reqs };
  const campName = (id: string) => options?.ownCampaigns.find((c) => c.id === id)?.title ?? options?.partnerOfferings.find((o) => "campaignId" in o.activity && o.activity.campaignId === id)?.label;
  const hasPartner = reqs.some((r) => r.offeringId);
  const noFreePath = rule ? !hasFreePath(rule) : false;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { questionId, title, teaser, content, unlock: rule, withdrawalPolicy: policy, availableFrom: fromLocal(from), availableUntil: fromLocal(until) };
      if (existing) await api(`/api/organizer/campaigns/${campaignId}/hints/${existing.id}`, { method: "PATCH", body });
      else await api(`/api/organizer/campaigns/${campaignId}/hints`, { method: "POST", body });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the hint.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-md border border-line bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Hint title" htmlFor={`ht-${questionId}`}>
          <input id={`ht-${questionId}`} className={inputClass} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="The Lending Secret" />
        </Field>
        <Field label="Teaser (public)" htmlFor={`hte-${questionId}`} hint="Shown while the hint is locked.">
          <input id={`hte-${questionId}`} className={inputClass} value={teaser} maxLength={300} onChange={(e) => setTeaser(e.target.value)} placeholder="A clue about the hidden engine" />
        </Field>
      </div>
      <Field label="Hidden clue" htmlFor={`hc-${questionId}`} hint="Never sent to players until they unlock it.">
        <textarea id={`hc-${questionId}`} className={`${textareaClass} min-h-20`} value={content} maxLength={2000} onChange={(e) => setContent(e.target.value)} />
      </Field>

      <fieldset>
        <legend className="text-[13px] font-semibold">Unlock method</legend>
        <div className="mt-1.5 flex gap-2">
          {(["free", "activities"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={`rounded-full border px-3 py-1 text-[13px] font-medium ${mode === m ? "border-orange bg-orange-wash text-orange-ink" : "border-line-strong text-ink-2"}`}>
              {m === "free" ? "Free for everyone" : "Unlock with activities"}
            </button>
          ))}
        </div>
      </fieldset>

      {mode === "activities" && (
        <div className="rounded-md bg-paper px-3 py-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span>Player must complete</span>
            <select className={`${inputClass} h-8 w-auto py-0`} value={op} onChange={(e) => setOp(e.target.value as "ANY" | "ALL")}>
              <option value="ANY">any one</option>
              <option value="ALL">all</option>
            </select>
            <span>of these activities:</span>
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {reqs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded bg-card px-3 py-2 text-[13px]">
                <span>
                  {describeActivity(r.activity, { campaign: campName })}
                  {r.offeringId && <span className="ml-2 text-[11.5px] text-violet-ink">by {options?.partnerOfferings.find((o) => o.id === r.offeringId)?.org.name ?? "partner"}</span>}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setReqs(reqs.filter((x) => x.id !== r.id))}>Remove</Button>
              </li>
            ))}
          </ul>
          {reqs.length < 8 && (
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => setPicking(true)}>
              + Add unlock activity
            </Button>
          )}
          {noFreePath && (
            <p className="mt-2 text-[12.5px] text-gold-ink">Every path needs a financial activity. Add a free alternative with “any one” so nobody has to spend to get help. Funded campaigns require it.</p>
          )}
          {hasPartner && (
            <Field label="If a partner withdraws after launch" htmlFor={`hp-${questionId}`}>
              <select id={`hp-${questionId}`} className={inputClass} value={policy} onChange={(e) => setPolicy(e.target.value as "disable" | "free")}>
                <option value="disable">Keep the requirement; stop new unlocks</option>
                <option value="free">Make the hint free for everyone</option>
              </select>
            </Field>
          )}
        </div>
      )}

      <details className="text-[13px]">
        <summary className="cursor-pointer font-medium text-ink-2">Availability window (optional)</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="Opens" htmlFor={`hf-${questionId}`}>
            <input id={`hf-${questionId}`} type="datetime-local" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Closes" htmlFor={`hu-${questionId}`}>
            <input id={`hu-${questionId}`} type="datetime-local" className={inputClass} value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
        </div>
      </details>

      {preview && (
        <div className="rounded-md border border-line bg-paper p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-ink">Player preview</p>
          <p className="mt-1 font-semibold">{title || "Untitled hint"} <span className="ml-1 rounded-full bg-paper-2 px-2 py-0.5 text-[10.5px] uppercase text-ink-3">{rule ? "Locked" : "Available"}</span></p>
          {teaser && <p className="text-[13px] text-ink-3">{teaser}</p>}
          {rule && (
            <ul className="mt-2 text-[13px]">
              <li className="text-[11.5px] uppercase tracking-wider text-ink-3">{reqs.length > 1 ? (op === "ALL" ? "Complete all of these" : "Complete any one of these") : "Requirement"}</li>
              {reqs.map((r) => <li key={r.id}>• {describeActivity(r.activity, { campaign: campName })}</li>)}
            </ul>
          )}
          <p className="mt-2 text-[12px] text-ink-3">The clue text stays hidden until unlocked.</p>
        </div>
      )}

      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || title.trim().length < 2 || content.trim().length < 2 || (mode === "activities" && reqs.length === 0)} onClick={save}>
          {busy ? "Saving…" : existing ? "Save hint" : "Add hint"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPreview(!preview)}>{preview ? "Hide preview" : "Preview"}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>

      {picking && options && <ActivityDrawer options={options} onClose={() => setPicking(false)} onPick={(leaf) => { setReqs([...reqs, leaf]); setPicking(false); }} />}
    </div>
  );
}

/** "Add unlock activity": catalogue by category; only working verifiers are selectable. */
function ActivityDrawer({ options, onClose, onPick }: { options: Options; onClose(): void; onPick(l: Leaf): void }) {
  const [type, setType] = useState<string | null>(null);
  const [offering, setOffering] = useState<Offering | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/55" onClick={onClose}>
      <div role="dialog" aria-label="Add unlock activity" className="flex h-full w-full max-w-[460px] flex-col overflow-y-auto border-l border-line bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{type || offering ? "Configure activity" : "Add unlock activity"}</h3>
          <Button size="sm" variant="ghost" onClick={type || offering ? () => { setType(null); setOffering(null); } : onClose}>
            {type || offering ? "Back" : "Close"}
          </Button>
        </div>
        {!type && !offering && (
          <>
            {options.partnerOfferings.length > 0 && (
              <section className="mt-4">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-violet-ink">From approved partners</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {options.partnerOfferings.map((o) => (
                    <li key={o.id}>
                      <button type="button" onClick={() => setOffering(o)} className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-left hover:border-violet">
                        <p className="font-medium">{o.title}</p>
                        <p className="text-[12.5px] text-ink-3">{o.org.name} · {o.label}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {GROUPS.map((g) => (
              <section key={g.id} className="mt-4">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">{g.label}</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {options.catalogue.filter((c) => c.category === g.id).map((c) => (
                    <li key={c.type}>
                      <button type="button" disabled={!c.available} onClick={() => setType(c.type)} className="w-full rounded-md border border-line bg-paper px-3 py-2.5 text-left enabled:hover:border-orange disabled:opacity-55">
                        <p className="flex items-center gap-2 font-medium">
                          {c.label}
                          {!c.available && <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-3">Unavailable</span>}
                        </p>
                        <p className="text-[12.5px] text-ink-3">{c.available ? c.description : c.unavailableReason}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
        {offering && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="font-medium">{offering.title}</p>
            <p className="text-[13px] text-ink-2">{offering.description || offering.label}</p>
            <p className="text-[12.5px] text-ink-3">Owned and verified by {offering.org.name}. Its settings are controlled by the partner.</p>
            <Button onClick={() => onPick({ kind: "activity", id: newLeafId(), activity: offering.activity, ownerOrgId: offering.org.id, offeringId: offering.id })}>Use this activity</Button>
          </div>
        )}
        {type && <ActivityConfig type={type} options={options} onPick={(activity) => onPick({ kind: "activity", id: newLeafId(), activity, ownerOrgId: "00000000-0000-4000-8000-000000000000" })} />}
      </div>
    </div>
  );
}

export function ActivityConfig({ type, options, onPick }: { type: string; options: Options; onPick(a: ActivityDef): void }) {
  const hunts = options.ownCampaigns.filter((c) => c.template === "treasure_hunt");
  const contests = options.ownCampaigns.filter((c) => c.template === "creative_contest");
  const [campaignId, setCampaignId] = useState("");
  const [num, setNum] = useState("");
  const [text, setText] = useState("");
  const [flag, setFlag] = useState(false);
  const [tokenA, setTokenA] = useState("");
  const [tokenB, setTokenB] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pickFrom = type === "internal_contest_entry" ? contests : type === "internal_campaign_completion" ? options.ownCampaigns : hunts;
  const units = (token: string, v: string) => {
    try {
      return toTokenUnits(token, v);
    } catch {
      throw new Error("Enter a valid amount for that token.");
    }
  };
  const submit = () => {
    setError(null);
    try {
      switch (type) {
        case "internal_campaign_completion":
          return onPick({ type, campaignId });
        case "internal_contest_entry":
          return onPick({ type, campaignId });
        case "internal_quiz":
          return onPick({ type, campaignId, ...(num ? { minScore: Number(num) } : {}) });
        case "internal_question_sequence":
          return onPick({ type, campaignId, questionCount: Number(num) });
        case "manual_review":
          return onPick({ type, instructions: text, requireLink: flag });
        case "near_rhea_swap":
          return onPick({ type, network: options.network, ...(tokenA ? { tokenIn: tokenA } : {}), ...(tokenB ? { tokenOut: tokenB } : {}), ...(tokenA && amount ? { minAmountIn: units(tokenA, amount) } : {}) });
        case "near_rhea_lending_supply":
          return onPick({ type, network: options.network, tokenId: tokenA, minAmount: units(tokenA, amount), ...(num ? { minHoldSeconds: Math.round(Number(num) * 3600) } : {}) });
        case "near_stake": {
          if (!/^\d+(\.\d{1,24})?$/.test(amount.trim()) || Number(amount) <= 0) throw new Error("Enter a minimum stake in NEAR, e.g. 1 or 0.5.");
          const [w, f = ""] = amount.trim().split(".");
          return onPick({ type, network: options.network, minAmount: (BigInt(w!) * 10n ** 24n + BigInt((f + "0".repeat(24)).slice(0, 24))).toString() });
        }
        case "meteor_wallet_signin":
          return onPick({ type });
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const tokenSelect = (value: string, set: (v: string) => void, label: string, anyLabel: string | null, lendingOnly = false) => (
    <Field label={label} htmlFor={`tok-${label}`}>
      <select id={`tok-${label}`} className={inputClass} value={value} onChange={(e) => set(e.target.value)}>
        {anyLabel !== null && <option value="">{anyLabel}</option>}
        {anyLabel === null && <option value="">Choose a token</option>}
        {options.tokens.filter((t) => !lendingOnly || t.burrowExtraDecimals !== null).map((t) => (
          <option key={t.contractId} value={t.contractId}>
            {t.symbol} · {t.contractId.length > 24 ? `${t.contractId.slice(0, 10)}…` : t.contractId}
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <div className="mt-4 flex flex-col gap-3">
      {type.startsWith("internal_") && (
        <Field label="Mission" htmlFor="act-camp" hint="One of your own missions.">
          <select id="act-camp" className={inputClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">Choose…</option>
            {pickFrom.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} {c.status === "DRAFT" ? "(draft — publish before launch)" : ""}
              </option>
            ))}
          </select>
        </Field>
      )}
      {type === "internal_quiz" && (
        <Field label="Minimum score (optional)" htmlFor="act-min">
          <input id="act-min" inputMode="numeric" className={inputClass} value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))} />
        </Field>
      )}
      {type === "internal_question_sequence" && (
        <Field label="Number of questions solved" htmlFor="act-n">
          <input id="act-n" inputMode="numeric" className={inputClass} value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))} />
        </Field>
      )}
      {type === "manual_review" && (
        <>
          <Field label="What should the player submit?" htmlFor="act-ins">
            <textarea id="act-ins" className={`${textareaClass} min-h-20`} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Share one improvement for our onboarding." />
          </Field>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={flag} onChange={(e) => setFlag(e.target.checked)} /> Require a link to their work
          </label>
          <p className="text-[12.5px] text-ink-3">Your team reviews each submission under Organizer → Reviews. Decisions are logged.</p>
        </>
      )}
      {type === "near_rhea_swap" && (
        <>
          {tokenSelect(tokenA, setTokenA, "Input token", "Any token")}
          {tokenSelect(tokenB, setTokenB, "Output token", "Any token")}
          {tokenA && (
            <Field label="Minimum amount in (optional)" htmlFor="act-amt" hint="In whole tokens, e.g. 5 or 2.5.">
              <input id="act-amt" inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          )}
        </>
      )}
      {type === "near_rhea_lending_supply" && (
        <>
          {tokenSelect(tokenA, setTokenA, "Asset", null, true)}
          <Field label="Minimum supply" htmlFor="act-amt2" hint="In whole tokens.">
            <input id="act-amt2" inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Holding period in hours (optional)" htmlFor="act-hold" hint="We re-check the position after this period before unlocking.">
            <input id="act-hold" inputMode="numeric" className={inputClass} value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))} />
          </Field>
        </>
      )}
      {type === "near_stake" && (
        <Field label="Minimum stake (NEAR)" htmlFor="act-stake" hint="Any validator pool on this network counts.">
          <input id="act-stake" inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1" />
        </Field>
      )}
      {type === "partner_api_event" && (
        <>
          <Field label="What should players do?" htmlFor="act-instr">
            <input id="act-instr" className={inputClass} maxLength={200} value={text} onChange={(e) => setText(e.target.value)} placeholder="Create an account in our app" />
          </Field>
          <Field label="Event name your app sends" htmlFor="act-event" hint="Lowercase, e.g. signed_up. See Settings → App events.">
            <input id="act-event" className={inputClass} value={tokenA} onChange={(e) => setTokenA(e.target.value)} placeholder="signed_up" />
          </Field>
        </>
      )}
      {type === "meteor_wallet_signin" && (
        <p className="text-[13px] text-ink-2">The player signs in (or links a wallet) with Meteor Wallet. The signature proves they own the account; which app signed is reported by the wallet.</p>
      )}
      {type.startsWith("near_") && (
        <details className="rounded-md bg-paper px-3 py-2 text-[12.5px] text-ink-2">
          <summary className="cursor-pointer font-medium">How verification works</summary>
          <p className="mt-1.5">
            Players paste their transaction hash. NEAR District fetches the final transaction from NEAR itself and checks that it was signed by a wallet the
            player proved they own, that the RHEA receipt succeeded, the exact token contracts, the amount and that it happened while your mission was open.
            A transaction can unlock only one requirement per mission. USD thresholds and Meteor-specific swaps aren&apos;t supported.
          </p>
        </details>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <Button onClick={submit}>Add activity</Button>
    </div>
  );
}
