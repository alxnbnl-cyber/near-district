"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Field, Notice, inputClass, textareaClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

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

const TYPE_LABEL = { short_text: "Short answer", multiple_choice: "Multiple choice", numeric: "Number" };

export function QuestionsPanel({ campaignId, questions, editable }: { campaignId: string; questions: QuestionRow[]; editable: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const move = async (idx: number, dir: -1 | 1) => {
    const order = questions.map((q) => q.id);
    const j = idx + dir;
    if (j < 0 || j >= order.length) return;
    [order[idx], order[j]] = [order[j]!, order[idx]!];
    try {
      await api(`/api/organizer/campaigns/${campaignId}/questions/order`, { method: "PUT", body: { order } });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reorder.");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {!editable && <Notice tone="info">Questions are locked after publishing so every participant answers the same hunt.</Notice>}
      {questions.length === 0 && editing !== "new" && <p className="text-sm text-ink-3">No questions yet.</p>}
      <ol className="flex flex-col gap-2">
        {questions.map((q, i) => (
          <li key={q.id} className="rounded-md border border-line bg-paper px-4 py-3">
            {editing === q.id ? (
              <QuestionForm campaignId={campaignId} existing={q} onDone={() => { setEditing(null); router.refresh(); }} onCancel={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-start gap-3">
                <span className="mt-0.5 font-display text-sm font-bold text-ink-3">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{q.prompt}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge>{TYPE_LABEL[q.type]}</Badge>
                    <Badge>Difficulty {q.difficulty}</Badge>
                    <Badge>{q.maxAttempts} attempts</Badge>
                    {q.cooldownSeconds > 0 && <Badge>{q.cooldownSeconds}s cooldown</Badge>}
                  </div>
                  {preview === q.id && (
                    <div className="mt-3 rounded-md border border-line bg-card p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-ink">Player preview</p>
                      <p className="mt-1 font-semibold">{q.prompt}</p>
                      {q.clue && <p className="mt-1 text-[13px] text-ink-3">Hint: {q.clue}</p>}
                      {q.options ? (
                        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">{q.options.map((o) => <span key={o.id} className="rounded border border-line px-3 py-2 text-sm">{o.label}</span>)}</div>
                      ) : (
                        <div className="mt-2 h-10 rounded border border-line-strong bg-paper" />
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setPreview(preview === q.id ? null : q.id)}>Preview</Button>
                  {editable && (
                    <>
                      <Button variant="ghost" size="sm" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
                      <Button variant="ghost" size="sm" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === questions.length - 1}>↓</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(q.id)}>Edit</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (!confirm("Delete this question?")) return;
                          await api(`/api/organizer/campaigns/${campaignId}/questions/${q.id}`, { method: "DELETE" }).catch((e) => setError(e.message));
                          router.refresh();
                        }}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
      {error && <Notice tone="danger">{error}</Notice>}
      {editable &&
        (editing === "new" ? (
          <div className="rounded-md border border-orange/50 bg-orange-wash/40 p-4">
            <QuestionForm campaignId={campaignId} onDone={() => { setEditing(null); router.refresh(); }} onCancel={() => setEditing(null)} />
          </div>
        ) : (
          <div>
            <Button variant="secondary" onClick={() => setEditing("new")}>Add question</Button>
          </div>
        ))}
    </div>
  );
}

function QuestionForm({ campaignId, existing, onDone, onCancel }: { campaignId: string; existing?: QuestionRow; onDone: () => void; onCancel: () => void }) {
  const [type, setType] = useState<QuestionRow["type"]>(existing?.type ?? "short_text");
  const [prompt, setPrompt] = useState(existing?.prompt ?? "");
  const [clue, setClue] = useState(existing?.clue ?? "");
  const [ref, setRef] = useState(existing?.referenceUrl ?? "");
  const [answers, setAnswers] = useState("");
  const [options, setOptions] = useState<{ id: string; label: string }[]>(existing?.options ?? [{ id: "a", label: "" }, { id: "b", label: "" }]);
  const [correct, setCorrect] = useState("");
  const [numeric, setNumeric] = useState("");
  const [tol, setTol] = useState("0");
  const [difficulty, setDifficulty] = useState(existing?.difficulty ?? 1);
  const [maxAttempts, setMaxAttempts] = useState(existing?.maxAttempts ?? 10);
  const [cooldown, setCooldown] = useState(existing?.cooldownSeconds ?? 0);
  const [stripP, setStripP] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const body = {
          type,
          prompt,
          clue: clue || undefined,
          referenceUrl: ref || "",
          difficulty,
          maxAttempts,
          cooldownSeconds: cooldown,
          stripPunctuation: stripP,
          answers: type === "short_text" ? answers.split("\n").map((a) => a.trim()).filter(Boolean) : undefined,
          options: type === "multiple_choice" ? options.filter((o) => o.label.trim()) : undefined,
          correctOptionId: type === "multiple_choice" ? correct : undefined,
          numericValue: type === "numeric" ? numeric : undefined,
          numericTolerance: tol || "0",
        };
        try {
          if (existing) await api(`/api/organizer/campaigns/${campaignId}/questions/${existing.id}`, { method: "PUT", body });
          else await api(`/api/organizer/campaigns/${campaignId}/questions`, { method: "POST", body });
          onDone();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not save the question.");
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <Field label="Type" htmlFor="qtype">
          <select id="qtype" className={inputClass} value={type} onChange={(e) => setType(e.target.value as QuestionRow["type"])}>
            <option value="short_text">Short answer</option>
            <option value="multiple_choice">Multiple choice</option>
            <option value="numeric">Number</option>
          </select>
        </Field>
        <Field label="Question" htmlFor="qprompt">
          <textarea id="qprompt" required className={textareaClass} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </Field>
      </div>

      {type === "short_text" && (
        <>
          <Field label="Accepted answers" htmlFor="qans" hint={existing ? "Answers are stored hashed and can't be shown again. Re-enter them to save changes." : "One per line. Matching ignores case and extra spaces."}>
            <textarea id="qans" required className={textareaClass} value={answers} onChange={(e) => setAnswers(e.target.value)} placeholder={"lighthouse\na lighthouse"} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={stripP} onChange={(e) => setStripP(e.target.checked)} /> Ignore punctuation when matching
          </label>
        </>
      )}
      {type === "multiple_choice" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-semibold">Options (select the correct one)</legend>
          {options.map((o, i) => (
            <div key={o.id} className="flex items-center gap-2">
              <input type="radio" name="correct" aria-label={`Option ${i + 1} is correct`} checked={correct === o.id} onChange={() => setCorrect(o.id)} />
              <input className={inputClass} value={o.label} placeholder={`Option ${i + 1}`} onChange={(e) => setOptions(options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))} />
            </div>
          ))}
          {options.length < 8 && (
            <div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOptions([...options, { id: String.fromCharCode(97 + options.length), label: "" }])}>
                Add option
              </Button>
            </div>
          )}
          {existing && <p className="text-[12.5px] text-ink-3">Re-select the correct option to save changes.</p>}
        </fieldset>
      )}
      {type === "numeric" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Correct number" htmlFor="qnum">
            <input id="qnum" required inputMode="decimal" className={inputClass} value={numeric} onChange={(e) => setNumeric(e.target.value)} />
          </Field>
          <Field label="Allowed difference" htmlFor="qtol" hint="0 = exact match.">
            <input id="qtol" inputMode="decimal" className={inputClass} value={tol} onChange={(e) => setTol(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hint (optional)" htmlFor="qclue">
          <input id="qclue" className={inputClass} value={clue} onChange={(e) => setClue(e.target.value)} />
        </Field>
        <Field label="Reference link (optional)" htmlFor="qref">
          <input id="qref" type="url" className={inputClass} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="https://" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Difficulty (1–5)" htmlFor="qdiff">
          <input id="qdiff" type="number" min={1} max={5} className={inputClass} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} />
        </Field>
        <Field label="Max attempts" htmlFor="qatt">
          <input id="qatt" type="number" min={1} max={100} className={inputClass} value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value))} />
        </Field>
        <Field label="Cooldown after a miss (s)" htmlFor="qcool">
          <input id="qcool" type="number" min={0} max={86400} className={inputClass} value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} />
        </Field>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : existing ? "Save question" : "Add question"}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
