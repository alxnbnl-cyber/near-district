"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ActivityDef, RuleNode } from "@yielvy/core";
import { Notice, inputClass, textareaClass } from "@/components/ui";
import { frame } from "@/components/explore/frame";
import { api, ApiError } from "@/lib/api";
import { useHintData, type HintRow } from "./HintsEditor";

export interface QuestionRow {
  id: string;
  position: number;
  type: "short_text" | "multiple_choice" | "numeric";
  prompt: string;
  clue: string | null;
  revealText?: string | null;
  options: { id: string; label: string }[] | null;
  referenceUrl: string | null;
  difficulty: number;
  maxAttempts: number;
  cooldownSeconds: number;
}

type ContractCall = Extract<ActivityDef, { type: "near_contract_call" }>;
const INK = "rgb(214 219 225";
const pad = (n: number) => String(n).padStart(2, "0");

const leafOf = (h?: HintRow) => (h?.unlock ? (h.unlock.kind === "group" ? (h.unlock.children[0] as Extract<RuleNode, { kind: "activity" }>) : (h.unlock as Extract<RuleNode, { kind: "activity" }>)) : undefined);

const label = "block text-[13.5px] font-semibold text-[rgb(214_219_225/.85)]";
const help = "mt-1 block text-[12px] text-ink-3";

/** Secrets: each is one question with one answer, plus an optional hint unlocked by an on-chain activity. */
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
      {/* how it works, in one line */}
      <ol className="grid gap-2 sm:grid-cols-3">
        {[
          ["1", "Write a secret", "A question with one answer."],
          ["2", "Set the answer", "Kept private. Players see it after the deadline."],
          ["3", "Add a hint (optional)", "Players unlock it by doing an on-chain activity."],
        ].map(([n, t, b]) => (
          <li key={n} className="flex items-start gap-3 bg-[rgb(255_255_255/.025)] px-3 py-2.5" style={frame(8, `${INK} / .1)`)}>
            <span className="grid size-6 shrink-0 place-items-center bg-orange text-[12px] font-bold text-[#140c05]">{n}</span>
            <span>
              <span className="block text-[14px] font-semibold text-white">{t}</span>
              <span className="block font-sans text-[12px] text-[rgb(214_219_225/.55)]">{b}</span>
            </span>
          </li>
        ))}
      </ol>

      <ol className="flex flex-col gap-2.5">
        {questions.map((q, i) => {
          const hint = hintData.hints.find((h) => h.questionId === q.id);
          const leaf = leafOf(hint);
          const act = leaf?.activity.type === "near_contract_call" ? (leaf.activity as ContractCall) : null;
          return (
            <li key={q.id}>
              {editing === q.id ? (
                <SecretForm campaignId={campaignId} index={i} existing={q} hint={hint} network={hintData.options?.network ?? "testnet"} onDone={done} onCancel={() => setEditing(null)} />
              ) : (
                <div className="group flex items-center gap-4 bg-[rgb(10_13_18/.6)] px-4 py-3.5" style={frame(10, `${INK} / .12)`)}>
                  <span className="grid size-10 shrink-0 place-items-center bg-[rgb(255_145_56/.12)] font-mono text-[13px] font-black text-orange" style={frame(7, "rgb(255 145 56 / .45)")}>
                    {pad(i + 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-white">{q.prompt}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                      <span className="text-[rgb(214_219_225/.5)]">Answer saved privately</span>
                      {leaf ? (
                        <span className="text-gold">Hint: {act ? `${act.methodName} on ${act.contractId}` : "activity"}</span>
                      ) : (
                        <span className="text-[rgb(214_219_225/.35)]">No hint</span>
                      )}
                      {act?.partner && <span className="text-violet-ink">Partner: {act.partner.name}</span>}
                    </p>
                  </div>
                  {editable && (
                    <div className="flex shrink-0 gap-1 text-[13px] font-semibold">
                      <button type="button" className="px-3 py-2 text-[rgb(214_219_225/.7)] hover:text-white" onClick={() => setEditing(q.id)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 text-[rgb(214_219_225/.45)] hover:text-danger"
                        onClick={async () => {
                          if (!confirm("Delete this secret?")) return;
                          try {
                            await api(`/api/organizer/campaigns/${campaignId}/questions/${q.id}`, { method: "DELETE" });
                            await done();
                          } catch (e) {
                            setError(e instanceof ApiError ? e.message : "Could not delete.");
                          }
                        }}
                      >
                        Delete
                      </button>
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
          <SecretForm campaignId={campaignId} index={questions.length} network={hintData.options?.network ?? "testnet"} onDone={done} onCancel={questions.length ? () => setEditing(null) : undefined} />
        ) : (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex h-14 items-center justify-center gap-2 text-[14px] font-semibold text-[rgb(214_219_225/.75)] transition-colors hover:bg-[rgb(255_145_56/.06)] hover:text-orange"
            style={frame(10, `${INK} / .22)`)}
          >
            + Add secret {pad(questions.length + 1)}
          </button>
        ))}
    </div>
  );
}

function SecretForm({
  campaignId,
  index,
  existing,
  hint,
  network,
  onDone,
  onCancel,
}: {
  campaignId: string;
  index: number;
  existing?: QuestionRow;
  hint?: HintRow;
  network: "mainnet" | "testnet";
  onDone(): void;
  onCancel?: () => void;
}) {
  const leaf = leafOf(hint);
  const prev = leaf?.activity.type === "near_contract_call" ? (leaf.activity as ContractCall) : null;
  const partnerAllowed = index === 1 || index === 2;
  const [prompt, setPrompt] = useState(existing?.prompt ?? "");
  const [answers, setAnswers] = useState("");
  const [reveal, setReveal] = useState(existing?.revealText ?? "");
  const [withHint, setWithHint] = useState(Boolean(hint));
  const [hintText, setHintText] = useState(hint?.content ?? "");
  const [contractId, setContractId] = useState(prev?.contractId ?? "");
  const [methodName, setMethodName] = useState(prev?.methodName ?? "");
  const [title, setTitle] = useState(prev?.title ?? "");
  const [desc, setDesc] = useState(prev?.description ?? "");
  const [withPartner, setWithPartner] = useState(Boolean(prev?.partner));
  const [partnerName, setPartnerName] = useState(prev?.partner?.name ?? "");
  const [partnerUrl, setPartnerUrl] = useState(prev?.partner?.url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const list = answers.split(",").map((a) => a.trim()).filter(Boolean);
      if (!prompt.trim()) throw new ApiError("Write the secret question first.", 400);
      if (!list.length) throw new ApiError(existing ? "Type the answer again to save (answers are never shown back, for safety)." : "Add the answer.", 400);
      let activity: ContractCall | null = null;
      if (withHint) {
        if (!hintText.trim()) throw new ApiError("Write the hint players unlock.", 400);
        if (!contractId.trim() || !methodName.trim()) throw new ApiError("Enter the contract and the function players must call.", 400);
        if (!title.trim()) throw new ApiError("Tell players what to do, e.g. “Mint the district badge”.", 400);
        if (withPartner && (!partnerName.trim() || !/^https:\/\//.test(partnerUrl.trim()))) throw new ApiError("Add the partner's name and a link starting with https://", 400);
        activity = {
          type: "near_contract_call",
          network,
          contractId: contractId.trim().toLowerCase(),
          methodName: methodName.trim(),
          title: title.trim(),
          ...(desc.trim() ? { description: desc.trim() } : {}),
          ...(partnerAllowed && withPartner ? { partner: { name: partnerName.trim(), url: partnerUrl.trim() } } : {}),
        };
      }
      const body = { type: "short_text", prompt, answers: list, ...(reveal.trim() ? { revealText: reveal.trim() } : {}), caseSensitive: false, stripPunctuation: true, difficulty: 1, maxAttempts: 100, cooldownSeconds: 0 };
      let qid = existing?.id;
      if (existing) await api(`/api/organizer/campaigns/${campaignId}/questions/${existing.id}`, { method: "PATCH", body });
      else qid = (await api<{ id: string }>(`/api/organizer/campaigns/${campaignId}/questions`, { method: "POST", body })).id;
      if (activity) {
        const hintBody = {
          questionId: qid,
          title: "Hint",
          teaser: "",
          content: hintText,
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
      setError(e instanceof ApiError ? e.message : "Could not save the secret.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="yv-pop bg-[linear-gradient(180deg,rgb(255_145_56/.07),rgb(10_13_18/.75)_40%)]" style={frame(12, "rgb(255 145 56 / .5)")}>
      <div className="flex items-center gap-3 border-b border-[rgb(255_255_255/.07)] px-5 py-3">
        <span className="grid size-8 place-items-center bg-orange font-mono text-[12px] font-black text-[#140c05]">{pad(index + 1)}</span>
        <p className="text-[15px] font-semibold text-orange">{existing ? "Edit secret" : "New secret"}</p>
      </div>

      <div className="grid gap-5 px-5 py-5 lg:grid-cols-2">
        <label className="lg:col-span-2">
          <span className={label}>The secret: what players must find out</span>
          <textarea className={`${textareaClass} mt-2 min-h-20 text-[15px]`} maxLength={1000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Which lending protocol powers our app?" />
        </label>
        <label>
          <span className={label}>Answer</span>
          <input className={`${inputClass} mt-2 h-11`} value={answers} onChange={(e) => setAnswers(e.target.value)} placeholder={existing ? "Type the answer again" : "RHEA"} />
          <span className={help}>Capitals and punctuation are ignored. Separate other spellings with commas.</span>
        </label>
        <label>
          <span className={label}>Revealed after the deadline (optional)</span>
          <input className={`${inputClass} mt-2 h-11`} maxLength={2000} value={reveal} onChange={(e) => setReveal(e.target.value)} placeholder="Answer: RHEA, the liquidity hub of NEAR." />
          <span className={help}>Players never see right or wrong until the mission ends.</span>
        </label>
      </div>

      {/* hint: a switch row, then plain fields underneath (no nested boxes) */}
      <div className="border-t border-[rgb(255_255_255/.07)] px-5 py-4">
        <button type="button" role="switch" aria-checked={withHint} onClick={() => setWithHint(!withHint)} className="flex w-full items-center gap-3 text-left">
          <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${withHint ? "bg-gold" : "bg-[rgb(214_219_225/.18)]"}`}>
            <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${withHint ? "left-[22px]" : "left-0.5"}`} />
          </span>
          <span>
            <span className="block text-[14px] font-semibold text-white">Add a hint</span>
            <span className="block text-[12.5px] text-ink-3">Stuck players unlock it by calling a smart contract function on NEAR.</span>
          </span>
        </button>

        {withHint && (
          <div className="mt-5 grid gap-5 border-l-2 border-gold/50 pl-5 lg:grid-cols-2">
            <label className="lg:col-span-2">
              <span className={label}>Hint text</span>
              <textarea className={`${textareaClass} mt-2 min-h-16`} maxLength={2000} value={hintText} onChange={(e) => setHintText(e.target.value)} placeholder="It's the liquidity hub of NEAR." />
              <span className={help}>Never sent to players until they unlock it.</span>
            </label>

            <div className="lg:col-span-2">
              <span className={label}>Activity that unlocks it</span>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex h-11 items-center gap-2 bg-[rgb(255_194_75/.12)] px-4 text-[13.5px] font-semibold text-gold" style={frame(8, "rgb(255 194 75 / .55)")}>
                  <span className="grid size-4 place-items-center rounded-full bg-gold text-[10px] font-bold text-[#2a1600]">✓</span>
                  Call a smart contract function
                </span>
                <span aria-disabled className="inline-flex h-11 cursor-not-allowed items-center gap-2 px-4 text-[13.5px] text-[rgb(214_219_225/.4)]" style={frame(8, `${INK} / .14)`)}>
                  <span className="size-4 rounded-full border border-[rgb(214_219_225/.3)]" />
                  More coming soon
                </span>
              </div>
            </div>

            <label>
              <span className={label}>Contract account</span>
              <input className={`${inputClass} mt-2 h-11 font-mono`} value={contractId} onChange={(e) => setContractId(e.target.value)} placeholder={network === "testnet" ? "nft.example.testnet" : "nft.example.near"} />
            </label>
            <label>
              <span className={label}>Function name</span>
              <input className={`${inputClass} mt-2 h-11 font-mono`} value={methodName} onChange={(e) => setMethodName(e.target.value)} placeholder="nft_mint" />
            </label>
            <label>
              <span className={label}>What players should do</span>
              <input className={`${inputClass} mt-2 h-11`} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mint the district badge" />
            </label>
            <label>
              <span className={label}>Extra instructions (optional)</span>
              <input className={`${inputClass} mt-2 h-11`} maxLength={1000} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Open the app, connect the same wallet, press Mint." />
            </label>
            <p className="text-[12px] text-ink-3 lg:col-span-2">
              When a player presses <b className="text-ink-2">Verify</b>, we look up their wallet&apos;s transactions on NEAR ({network}) and check that the same wallet
              successfully called <span className="font-mono text-ink-2">{methodName || "function"}</span> on <span className="font-mono text-ink-2">{contractId || "the contract"}</span> while the mission was open. No transaction hash needed.
            </p>

            {partnerAllowed ? (
              <div className="lg:col-span-2">
                <label className="flex cursor-pointer items-center gap-2.5 text-[14px] font-semibold text-white">
                  <input type="checkbox" checked={withPartner} onChange={(e) => setWithPartner(e.target.checked)} className="size-4 accent-[var(--color-orange)]" />
                  This activity belongs to a partner (optional)
                </label>
                {withPartner && (
                  <div className="mt-3 grid gap-5 lg:grid-cols-2">
                    <label>
                      <span className={label}>Partner name</span>
                      <input className={`${inputClass} mt-2 h-11`} maxLength={60} value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder="Badge Labs" />
                    </label>
                    <label>
                      <span className={label}>Partner link</span>
                      <input className={`${inputClass} mt-2 h-11`} maxLength={300} value={partnerUrl} onChange={(e) => setPartnerUrl(e.target.value)} placeholder="https://badges.example" />
                    </label>
                    <p className="text-[12px] text-ink-3 lg:col-span-2">Linked straight away, no approval needed. Players see the partner and a button to open their app.</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[12.5px] text-[rgb(214_219_225/.45)] lg:col-span-2">Partners can be linked on secrets 02 and 03.</p>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="px-5 pb-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
      <div className="flex gap-2 border-t border-[rgb(255_255_255/.07)] px-5 py-4">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="h-11 bg-orange px-6 text-[14px] font-bold text-[#140c05] transition-colors hover:bg-[#ffa458] disabled:opacity-50"
          style={frame(9, "rgb(255 145 56)")}
        >
          {busy ? "Saving…" : existing ? "Save secret" : "Add secret"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-11 px-5 text-[14px] font-semibold text-[rgb(214_219_225/.6)] hover:text-white">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
