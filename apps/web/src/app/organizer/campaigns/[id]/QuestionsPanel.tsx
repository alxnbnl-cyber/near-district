"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { describeActivity, type ActivityDef, type RuleNode } from "@yielvy/core";
import { Button, Notice, inputClass, textareaClass } from "@/components/ui";
import { KeyArt } from "@/components/art/Art";
import { api, ApiError } from "@/lib/api";
import { ActivityConfig, useHintData, type HintRow } from "./HintsEditor";

export interface QuestionRow {
  id: string;
  position: number;
  type: "short_text" | "multiple_choice" | "numeric";
  prompt: string;
  clue: string | null;
  options: { id: string; label: string }[] | null;
  referenceUrl: string | null;
  difficulty: number;
  maxAttempts: number;
  cooldownSeconds: number;
}

/** The activities offered for now. Everything else stays in the engine, hidden from the builder. */
const HINT_ACTIVITIES = [
  { type: "near_rhea_swap", title: "Swap on RHEA", body: "Player makes a swap on RHEA." },
  { type: "near_rhea_lending_supply", title: "Supply to RHEA Lending", body: "Player supplies a token to RHEA Lending." },
  { type: "manual_review", title: "Share feedback or work", body: "Player submits something, your team approves it." },
] as const;

const leafOf = (h?: HintRow) => (h?.unlock ? (h.unlock.kind === "group" ? (h.unlock.children[0] as Extract<RuleNode, { kind: "activity" }>) : (h.unlock as Extract<RuleNode, { kind: "activity" }>)) : undefined);

export function QuestionsPanel({ campaignId, questions, editable }: { campaignId: string; questions: QuestionRow[]; editable: boolean }) {
  const router = useRouter();
  const hintData = useHintData(campaignId);
  const [editing, setEditing] = useState<string | "new" | null>(questions.length === 0 && editable ? "new" : null);
  const [error, setError] = useState<string | null>(null);

  const done = async () => {
    setEditing(null);
    await hintData.reload();
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <ol className="yv-stagger flex flex-col gap-3">
        {questions.map((q, i) => {
          const hint = hintData.hints.find((h) => h.questionId === q.id);
          const leaf = leafOf(hint);
          return (
            <li key={q.id}>
              {editing === q.id ? (
                <ClueForm campaignId={campaignId} index={i} existing={q} hint={hint} options={hintData.options} onDone={done} onCancel={() => setEditing(null)} />
              ) : (
                <div className="flex items-start gap-3 rounded-[16px] border border-line bg-paper p-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-orange-wash font-display text-[14px] font-bold text-orange">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{q.prompt}</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-3">Answer saved privately</p>
                    {leaf && (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gold-wash px-2.5 py-1 text-[12px] font-semibold text-gold-ink">
                        🔑 Hint: {describeActivity(leaf.activity)}
                      </p>
                    )}
                  </div>
                  {editable && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(q.id)}>Edit</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (!confirm("Delete this clue?")) return;
                          try {
                            await api(`/api/organizer/campaigns/${campaignId}/questions/${q.id}`, { method: "DELETE" });
                            await done();
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
              )}
            </li>
          );
        })}
      </ol>
      {error && <Notice tone="danger">{error}</Notice>}
      {editable &&
        (editing === "new" ? (
          <ClueForm campaignId={campaignId} index={questions.length} options={hintData.options} onDone={done} onCancel={questions.length ? () => setEditing(null) : undefined} />
        ) : (
          <button type="button" onClick={() => setEditing("new")} className="rounded-[16px] border-2 border-dashed border-line-strong py-4 text-[14px] font-semibold text-ink-2 transition-colors hover:border-orange hover:text-orange">
            + Add a clue
          </button>
        ))}
    </div>
  );
}

function ClueForm({
  campaignId,
  index,
  existing,
  hint,
  options,
  onDone,
  onCancel,
}: {
  campaignId: string;
  index: number;
  existing?: QuestionRow;
  hint?: HintRow;
  options: ReturnType<typeof useHintData>["options"];
  onDone(): void;
  onCancel?: () => void;
}) {
  const existingLeaf = leafOf(hint);
  const [prompt, setPrompt] = useState(existing?.prompt ?? "");
  const [answers, setAnswers] = useState("");
  const [withHint, setWithHint] = useState(Boolean(hint));
  const [clue, setClue] = useState(hint?.content ?? "");
  const [activity, setActivity] = useState<ActivityDef | null>(existingLeaf?.offeringId ? null : (existingLeaf?.activity ?? null));
  const [pickType, setPickType] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = (t: string) => options?.catalogue.find((c) => c.type === t)?.available ?? false;
  const reason = (t: string) => options?.catalogue.find((c) => c.type === t)?.unavailableReason;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const list = answers.split(",").map((a) => a.trim()).filter(Boolean);
      if (!prompt.trim()) throw new ApiError("Write the question first.", 400);
      if (!list.length) throw new ApiError(existing ? "Type the answer again to save (answers are never shown back, for safety)." : "Add the answer.", 400);
      if (withHint && (!clue.trim() || !activity)) throw new ApiError("Write the hidden clue and pick the activity that unlocks it.", 400);
      const body = { type: "short_text", prompt, answers: list, caseSensitive: false, stripPunctuation: true, difficulty: 1, maxAttempts: 100, cooldownSeconds: 60 };
      let qid = existing?.id;
      if (existing) await api(`/api/organizer/campaigns/${campaignId}/questions/${existing.id}`, { method: "PATCH", body });
      else qid = (await api<{ id: string }>(`/api/organizer/campaigns/${campaignId}/questions`, { method: "POST", body })).id;
      if (withHint && activity) {
        const hintBody = {
          questionId: qid,
          title: "Hint",
          teaser: "",
          content: clue,
          unlock: { kind: "group", op: "ANY", children: [{ kind: "activity", id: "unlock", ownerOrgId: "00000000-0000-4000-8000-000000000000", activity }] },
          withdrawalPolicy: "disable",
        };
        if (hint) await api(`/api/organizer/campaigns/${campaignId}/hints/${hint.id}`, { method: "PATCH", body: hintBody });
        else await api(`/api/organizer/campaigns/${campaignId}/hints`, { method: "POST", body: hintBody });
      } else if (hint) {
        await api(`/api/organizer/campaigns/${campaignId}/hints/${hint.id}`, { method: "DELETE" });
      }
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the clue.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="yv-pop flex flex-col gap-4 rounded-[18px] border border-orange/50 bg-[linear-gradient(180deg,rgb(255_145_56/.07),transparent)] p-5">
      <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-orange-ink">Clue {index + 1}</p>
      <label>
        <span className="text-[13px] font-semibold">Question</span>
        <textarea className={`${textareaClass} mt-1.5 min-h-20 text-[15px]`} maxLength={1000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Which lending protocol powers our app?" />
      </label>
      <label>
        <span className="text-[13px] font-semibold">Answer</span>
        <input className={`${inputClass} mt-1.5 h-11`} value={answers} onChange={(e) => setAnswers(e.target.value)} placeholder={existing ? "Type the answer again" : "RHEA"} />
        <span className="mt-1 block text-[12px] text-ink-3">Capitals and punctuation are ignored. Separate other accepted spellings with commas.</span>
      </label>

      {/* hint, unlocked by one activity */}
      <div className={`rounded-[14px] border p-4 transition-colors ${withHint ? "border-gold/50 bg-gold-wash/40" : "border-line bg-paper"}`}>
        <label className="flex cursor-pointer items-center gap-3">
          <input type="checkbox" checked={withHint} onChange={(e) => setWithHint(e.target.checked)} className="size-4 accent-[var(--color-gold)]" />
          <KeyArt size={28} />
          <span>
            <span className="block text-[14px] font-semibold">Unlock hint with an activity</span>
            <span className="block text-[12px] text-ink-3">Stuck players do one activity to reveal your clue.</span>
          </span>
        </label>
        {withHint && (
          <div className="mt-4 grid gap-4">
            <div className="flex flex-col gap-3">
              <label>
                <span className="text-[13px] font-semibold">Hidden clue</span>
                <textarea className={`${textareaClass} mt-1.5 min-h-16`} maxLength={2000} value={clue} onChange={(e) => setClue(e.target.value)} placeholder="It merged Ref and Burrow." />
              </label>
              <div>
                <p className="text-[13px] font-semibold">Activity that unlocks it</p>
                {activity && !pickType ? (
                  <div className="mt-1.5 flex items-center justify-between gap-2 rounded-[12px] border border-line bg-card px-3 py-2.5 text-[13.5px]">
                    <span>✓ {describeActivity(activity)}</span>
                    <Button variant="ghost" size="sm" onClick={() => setPickType(activity.type)}>Change</Button>
                  </div>
                ) : (
                  <div className="mt-1.5 grid gap-2">
                    {HINT_ACTIVITIES.map((a) => (
                      <button
                        key={a.type}
                        type="button"
                        disabled={!available(a.type)}
                        onClick={() => setPickType(a.type)}
                        className={`rounded-[12px] border px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${pickType === a.type ? "border-gold bg-card" : "border-line bg-card enabled:hover:border-line-strong"}`}
                      >
                        <span className="block text-[13.5px] font-semibold">{a.title}</span>
                        <span className="block text-[12px] text-ink-3">{available(a.type) ? a.body : reason(a.type)}</span>
                      </button>
                    ))}
                    <p className="px-1 text-[12px] text-ink-3">More activities coming soon.</p>
                  </div>
                )}
                {pickType && options && (
                  <div className="mt-2 rounded-[12px] border border-line bg-card p-3">
                    <ActivityConfig
                      key={pickType}
                      type={pickType}
                      options={options}
                      onPick={(a) => {
                        setActivity(a);
                        setPickType(null);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
            {/* live preview */}
            <div className="rounded-[14px] border border-line bg-[#0e131b] p-3">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-3">Player sees</p>
              <div className="mt-2 rounded-[12px] border border-line bg-paper p-3">
                <p className="flex items-center gap-2 text-[13.5px] font-semibold">
                  🔒 Hint <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[10px] uppercase text-ink-3">Locked</span>
                </p>
                <p className="mt-1.5 text-[12.5px] text-ink-2">{activity ? describeActivity(activity) : "Pick an activity"}</p>
                <span className="mt-2 inline-block rounded-md bg-orange px-2.5 py-1 text-[11.5px] font-semibold text-[#140c05]">Verify activity</span>
              </div>
              <p className="mt-2 text-[11.5px] text-ink-3">After it&apos;s verified: “{clue || "your clue"}”</p>
            </div>
          </div>
        )}
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : existing ? "Save clue" : "Add clue"}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
