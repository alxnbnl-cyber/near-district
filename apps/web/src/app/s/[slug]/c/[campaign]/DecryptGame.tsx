"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { HintCard, HintRequirement } from "@/components/campaign/HintCards";
import { frame, plate } from "@/components/explore/frame";

/**
 * Cyber "decrypt the vault" view of a sealed treasure hunt: each secret is a lock sphere. Players
 * pick a lock, type the answer to seal it, and can run an on-chain activity to decrypt a hint.
 * Results stay hidden until the deadline, then each sphere turns green or red.
 */

export interface DecryptQuestion {
  id: string;
  index: number;
  type: "short_text" | "multiple_choice" | "numeric";
  prompt: string;
  clue: string | null;
  options: { id: string; label: string }[] | null;
  imageUrl: string | null;
  referenceUrl: string | null;
  saved: string | null;
  savedAt: string | null;
  result: { correct: boolean; reveal: string | null } | null;
  hints: HintCard[];
}

type LockState = "locked" | "sealed" | "correct" | "wrong";
const COLOR: Record<LockState, string> = { locked: "#45e3ff", sealed: "#FFC24B", correct: "#34d399", wrong: "#f87171" };
const pad = (n: number) => String(n).padStart(2, "0");
const GLYPHS = "ABCDEF0123456789#$%&@*+=<>";

/** Text that scrambles through random glyphs before settling (respects reduced motion). */
function Scramble({ text, className = "" }: { text: string; className?: string }) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return setOut(text);
    let frameNo = 0;
    const total = 14;
    const t = setInterval(() => {
      frameNo++;
      const settled = Math.floor((frameNo / total) * text.length);
      setOut(text.split("").map((ch, i) => (i < settled || ch === " " ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!)).join(""));
      if (frameNo >= total) {
        clearInterval(t);
        setOut(text);
      }
    }, 40);
    return () => clearInterval(t);
  }, [text]);
  return <span className={className}>{out}</span>;
}

/** One lock: rotating rings around a glowing core. */
export function LockSphere({ state, index, active, size = 92, onClick }: { state: LockState; index: number; active?: boolean; size?: number; onClick?: () => void }) {
  const c = COLOR[state];
  const icon = state === "correct" ? "✓" : state === "wrong" ? "✕" : state === "sealed" ? "◆" : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Secret ${index + 1}: ${state === "locked" ? "locked" : state === "sealed" ? "answer sealed" : state === "correct" ? "decrypted" : "wrong"}`}
      aria-pressed={active}
      className={`group relative grid shrink-0 place-items-center transition-transform duration-300 ${active ? "scale-110" : "hover:scale-105"}`}
      style={{ width: size, height: size }}
    >
      {active && <span aria-hidden className="dg-pulse absolute inset-0 rounded-full" style={{ boxShadow: `0 0 0 2px ${c}88, 0 0 34px ${c}66` }} />}
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <radialGradient id={`core-${index}-${state}`} cx="50%" cy="45%" r="55%">
            <stop offset="0" stopColor={c} stopOpacity=".95" />
            <stop offset=".45" stopColor={c} stopOpacity=".35" />
            <stop offset="1" stopColor="#05070a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="dg-spin" style={{ transformOrigin: "50px 50px" }}>
          <circle cx="50" cy="50" r="46" fill="none" stroke={c} strokeOpacity=".55" strokeWidth="1.2" strokeDasharray="3 6" />
        </g>
        <g className="dg-spin-rev" style={{ transformOrigin: "50px 50px" }}>
          <circle cx="50" cy="50" r="38" fill="none" stroke={c} strokeOpacity=".9" strokeWidth="2.5" strokeDasharray="34 26" strokeLinecap="round" />
        </g>
        <ellipse cx="50" cy="50" rx="30" ry="10" fill="none" stroke={c} strokeOpacity=".35" strokeWidth="1" className="dg-orbit" style={{ transformOrigin: "50px 50px" }} />
        <circle cx="50" cy="50" r="27" fill={`url(#core-${index}-${state})`} />
        <circle cx="50" cy="50" r="27" fill="none" stroke={c} strokeOpacity=".7" strokeWidth="1" />
      </svg>
      <span className="relative grid place-items-center font-mono font-black" style={{ color: state === "locked" ? "#e6fbff" : "#0b0f15", fontSize: size * 0.2 }}>
        {icon ?? (
          <svg width={size * 0.26} height={size * 0.26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        )}
      </span>
      <span className="absolute -bottom-6 font-mono text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: c }}>
        {pad(index + 1)}
      </span>
    </button>
  );
}

export function DecryptStyles() {
  return (
    <style>{`
      @keyframes dg-spin { to { transform: rotate(360deg) } }
      .dg-spin { animation: dg-spin 14s linear infinite }
      .dg-spin-rev { animation: dg-spin 9s linear infinite reverse }
      @keyframes dg-orbit { 0% { transform: rotate(0deg) } 100% { transform: rotate(-360deg) } }
      .dg-orbit { animation: dg-orbit 6s linear infinite }
      @keyframes dg-pulse { 0%,100% { opacity: .55; transform: scale(1) } 50% { opacity: 1; transform: scale(1.06) } }
      .dg-pulse { animation: dg-pulse 2s ease-in-out infinite }
      @keyframes dg-flow { to { background-position: 24px 0 } }
      .dg-flow { background-size: 24px 2px; animation: dg-flow 1.2s linear infinite }
      @keyframes dg-scan { 0% { transform: translateY(-100%) } 100% { transform: translateY(100%) } }
      .dg-scan::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent, rgb(69 227 255 / .06), transparent); animation: dg-scan 3.5s linear infinite; pointer-events: none }
      @keyframes dg-stamp { 0% { opacity: 0; transform: scale(1.8) rotate(-10deg) } 45% { opacity: 1; transform: scale(.95) rotate(-5deg) } 100% { opacity: 1; transform: scale(1) rotate(-5deg) } }
      .dg-stamp { animation: dg-stamp 420ms cubic-bezier(.2,.8,.2,1) both }
      @media (prefers-reduced-motion: reduce) { .dg-spin, .dg-spin-rev, .dg-orbit, .dg-pulse, .dg-flow, .dg-scan::after, .dg-stamp { animation: none } }
    `}</style>
  );
}

export function lockStateOf(q: DecryptQuestion, closed: boolean): LockState {
  if (closed) return q.result?.correct ? "correct" : "wrong";
  return q.saved ? "sealed" : "locked";
}

/** The row of locks joined by flowing data lines. */
export function LockGrid({ questions, total, closed, active, onPick }: { questions: DecryptQuestion[]; total: number; closed: boolean; active: number; onPick(i: number): void }) {
  return (
    <div className="flex items-center justify-center overflow-x-auto px-2 pb-8 pt-3">
      {Array.from({ length: total }, (_, i) => {
        const q = questions[i];
        const st = q ? lockStateOf(q, closed) : "locked";
        return (
          <div key={i} className="flex items-center">
            {i > 0 && (
              <span
                aria-hidden
                className="dg-flow mx-2 h-[2px] w-10 sm:w-16"
                style={{ backgroundImage: `repeating-linear-gradient(90deg, ${COLOR[st]} 0 8px, transparent 8px 16px)`, opacity: st === "locked" ? 0.35 : 0.9 }}
              />
            )}
            <LockSphere state={st} index={i} active={i === active} onClick={() => onPick(i)} />
          </div>
        );
      })}
    </div>
  );
}

/** The console for one secret: question, answer input, and the hint (intel) to decrypt. */
export function SecretConsole({
  q,
  total,
  campaignId,
  closed,
  onSaved,
  onHints,
  onNav,
}: {
  q: DecryptQuestion;
  total: number;
  campaignId: string;
  closed: boolean;
  onSaved(): void;
  onHints(h: HintCard[]): void;
  onNav(delta: number): void;
}) {
  const [value, setValue] = useState(q.saved ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    setValue(q.saved ?? "");
    setMsg(null);
  }, [q.id, q.saved]);
  const dirty = value.trim() !== (q.saved ?? "").trim();
  const st = lockStateOf(q, closed);
  const c = COLOR[st];

  const save = async (v: string) => {
    if (!v.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/campaigns/${campaignId}/answer`, { method: "POST", body: { questionId: q.id, answer: v } });
      setFlash(true);
      setTimeout(() => setFlash(false), 1100);
      setMsg({ tone: "ok", text: q.saved ? "Answer updated and re-sealed" : "Answer sealed into the lock" });
      onSaved();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof ApiError ? e.message : "Couldn't seal it. Your other answers are safe." });
    } finally {
      setBusy(false);
    }
  };

  const statusText = closed ? (q.result?.correct ? "DECRYPTED" : "ACCESS DENIED") : q.saved ? "ANSWER SEALED" : "ENCRYPTED";

  return (
    <section className="dg-scan relative overflow-hidden bg-[radial-gradient(120%_90%_at_0%_0%,rgb(69_227_255/.08),transparent_55%),linear-gradient(180deg,rgb(6_10_15/.92),rgb(4_6_9/.95))] font-mono" style={frame(16, `${c}88`)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgb(255_255_255/.018)_0_1px,transparent_1px_3px)]" />
      {flash && <span className="dg-stamp absolute right-5 top-14 z-10 border-2 border-reward px-3 py-1 text-[11px] font-black uppercase tracking-[0.3em] text-reward">Sealed</span>}

      {/* header bar */}
      <div className="relative flex items-center gap-3 border-b px-5 py-3" style={{ borderColor: `${c}33` }}>
        <span className="size-2 rounded-full" style={{ background: c, boxShadow: `0 0 10px ${c}` }} />
        <span className="text-[11px] font-black uppercase tracking-[0.28em]" style={{ color: c }}>
          Secret {pad(q.index + 1)} <span className="text-[rgb(214_219_225/.35)]">/ {pad(total)}</span>
        </span>
        <Scramble key={statusText} text={`// ${statusText}`} className="text-[11px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.55)]" />
        <span className="ml-auto flex gap-1">
          <button type="button" onClick={() => onNav(-1)} disabled={q.index === 0} aria-label="Previous secret" className="grid size-8 place-items-center text-[rgb(214_219_225/.6)] hover:text-white disabled:opacity-25" style={frame(6, "rgb(214 219 225 / .2)")}>
            ‹
          </button>
          <button type="button" onClick={() => onNav(1)} disabled={q.index === total - 1} aria-label="Next secret" className="grid size-8 place-items-center text-[rgb(214_219_225/.6)] hover:text-white disabled:opacity-25" style={frame(6, "rgb(214 219 225 / .2)")}>
            ›
          </button>
        </span>
      </div>

      <div className="relative px-5 py-6 md:px-7">
        <h3 className="whitespace-pre-line font-display text-[22px] font-bold leading-snug text-white md:text-[26px]">{q.prompt}</h3>
        {q.clue && <p className="mt-2 font-sans text-[14px] italic text-[rgb(214_219_225/.65)]">{q.clue}</p>}
        {q.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={q.imageUrl} alt="Image for this secret" className="mt-3 max-h-72 border border-[rgb(255_255_255/.1)] object-contain" />
        )}
        {q.referenceUrl && (
          <a href={q.referenceUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#45e3ff] hover:underline">
            Investigate ↗
          </a>
        )}

        {closed ? (
          <div className="mt-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.5)]">Your answer</p>
            <p className="mt-1 font-sans text-[16px] text-white">{q.type === "multiple_choice" ? (q.options?.find((o) => o.id === q.saved)?.label ?? "—") : (q.saved ?? "—")}</p>
            {q.result?.reveal && (
              <div className="mt-4 border-l-2 border-reward pl-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-reward">Revealed</p>
                <p className="mt-1 whitespace-pre-line font-sans text-[14.5px] text-[rgb(214_219_225/.85)]">{q.result.reveal}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6">
            {q.type === "multiple_choice" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {q.options!.map((o, i) => {
                  const picked = (q.saved ?? "") === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      disabled={busy}
                      onClick={() => save(o.id)}
                      aria-pressed={picked}
                      className={`flex items-center gap-3 px-4 py-3.5 text-left text-[15px] text-white transition-colors disabled:opacity-50 ${picked ? "bg-[rgb(255_194_75/.12)]" : "bg-[rgb(69_227_255/.04)] hover:bg-[rgb(69_227_255/.1)]"}`}
                      style={frame(9, picked ? "rgb(255 194 75 / .6)" : "rgb(69 227 255 / .25)")}
                    >
                      <span className={`grid size-7 shrink-0 place-items-center border text-[12px] font-black ${picked ? "border-reward text-reward" : "border-[rgb(69_227_255/.45)] text-[#45e3ff]"}`}>{picked ? "◆" : String.fromCharCode(65 + i)}</span>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(value);
                }}
              >
                <label htmlFor={`a-${q.id}`} className="sr-only">Your answer</label>
                <div className="flex h-14 flex-1 items-center gap-2 bg-[rgb(69_227_255/.05)] px-4" style={frame(9, "rgb(69 227 255 / .35)")}>
                  <span className="text-[16px] font-bold text-[#45e3ff]">&gt;</span>
                  <input
                    id={`a-${q.id}`}
                    autoComplete="off"
                    spellCheck={false}
                    inputMode={q.type === "numeric" ? "decimal" : "text"}
                    className="h-full w-full bg-transparent text-[17px] tracking-[0.06em] text-white caret-[#45e3ff] placeholder:text-[rgb(214_219_225/.3)] focus:outline-none"
                    placeholder="enter the answer"
                    value={value}
                    maxLength={500}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !value.trim() || !dirty}
                  className="inline-flex h-14 shrink-0 items-center justify-center gap-2 bg-[linear-gradient(180deg,#ffa458,#ff8a2a)] px-7 text-[13px] font-black uppercase tracking-[0.2em] text-[#140c05] shadow-[0_0_24px_rgb(255_145_56/.35)] transition-shadow hover:shadow-[0_0_36px_rgb(255_145_56/.6)] disabled:opacity-45"
                  style={plate(11)}
                >
                  {busy ? "Sealing…" : q.saved ? (dirty ? "Re-seal" : "Sealed ◆") : "Seal answer"}
                </button>
              </form>
            )}
            <p className="mt-2 min-h-5 text-[11px] font-bold uppercase tracking-[0.14em]" aria-live="polite">
              {msg ? <span className={msg.tone === "ok" ? "text-gold" : "text-danger"}>{msg.text}</span> : <span className="text-[rgb(214_219_225/.4)]">Locks reveal at the deadline. You can change answers until then.</span>}
            </p>
            {q.hints.map((h) => (
              <Intel key={h.id} campaignId={campaignId} h={h} onChange={onHints} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** A hint as "intel": locked until the player completes the activity, then decrypted. */
function Intel({ campaignId, h, onChange }: { campaignId: string; h: HintCard; onChange(h: HintCard[]): void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "danger"; text: string } | null>(null);
  const [txs, setTxs] = useState<Record<string, string>>({});
  const unlocked = h.status === "UNLOCKED";

  const call = async (key: string, path: string, body?: unknown) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await api<{ hints: HintCard[]; outcome?: { status: string; message: string | null; unlocked: boolean } }>(path, { method: "POST", body: body ?? {} });
      onChange(r.hints);
      const o = r.outcome;
      if (o)
        setMsg(
          o.unlocked
            ? { tone: "ok", text: "Activity verified. Intel decrypted." }
            : o.status === "verified"
              ? { tone: "ok", text: "Verified. Finish the remaining activity to decrypt." }
              : o.status === "pending"
                ? { tone: "warn", text: o.message ?? "Waiting for the network. We'll keep checking." }
                : o.status === "under_review"
                  ? { tone: "warn", text: "Submitted for review." }
                  : { tone: "danger", text: o.message ?? "We couldn't verify that yet." },
        );
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Something went wrong. Your progress is safe." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-6 border-t border-dashed border-[rgb(255_194_75/.25)] pt-5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-[0.26em] text-gold">💡 Intel</span>
        <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${unlocked ? "text-mint-ink" : "text-[rgb(214_219_225/.45)]"}`}>
          {unlocked ? "// decrypted" : h.status === "PENDING_VERIFICATION" ? "// verifying…" : h.free ? "// available" : "// locked"}
        </span>
      </div>

      {unlocked ? (
        <div className="mt-3 border-l-2 border-mint pl-4">
          <Scramble text={h.content ?? ""} className="block whitespace-pre-line font-sans text-[15px] leading-relaxed text-white" />
          {h.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={h.imageUrl} alt="" className="mt-3 max-h-64 border border-[rgb(255_255_255/.1)] object-contain" />
          )}
        </div>
      ) : h.lockReason ? (
        <p className="mt-2 font-sans text-[13px] text-[rgb(214_219_225/.55)]">{h.lockReason === "not_yet" ? "This intel unlocks later." : "This intel can't be unlocked right now."}</p>
      ) : h.free ? (
        <button type="button" disabled={busy !== null} onClick={() => call("reveal", `/api/campaigns/${campaignId}/hints/${h.id}/reveal`)} className="mt-3 h-10 px-5 text-[11px] font-black uppercase tracking-[0.18em] text-[#140c05] disabled:opacity-50" style={{ ...plate(8), background: "#FFC24B" }}>
          {busy ? "Decrypting…" : "Decrypt intel"}
        </button>
      ) : (
        <>
          <p className="mt-2 font-sans text-[13.5px] text-[rgb(214_219_225/.7)]">Complete {h.requirements.length > 1 ? (h.op === "ALL" ? "these activities" : "one of these activities") : "this activity"} on NEAR to decrypt the hint.</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {h.requirements.map((r) => (
              <Activity
                key={r.id}
                r={r}
                busy={busy}
                tx={txs[r.id] ?? ""}
                setTx={(v) => setTxs((x) => ({ ...x, [r.id]: v }))}
                onVerify={(body) => call(r.id, `/api/campaigns/${campaignId}/hints/${h.id}/verify`, { leafId: r.id, ...body })}
              />
            ))}
          </ul>
        </>
      )}
      {msg && (
        <p role="status" className={`mt-3 text-[12px] font-bold uppercase tracking-[0.12em] ${msg.tone === "ok" ? "text-mint-ink" : msg.tone === "warn" ? "text-gold" : "text-danger"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

function Activity({ r, busy, tx, setTx, onVerify }: { r: HintRequirement; busy: string | null; tx: string; setTx(v: string): void; onVerify(body: Record<string, unknown>): void }) {
  const done = r.status === "VERIFIED";
  const partner = r.contract?.partner ?? null;
  const verifyBtn = (label = "Verify activity", disabled = false, body: Record<string, unknown> = {}) => (
    <button
      type="button"
      disabled={busy !== null || disabled}
      onClick={() => onVerify(body)}
      className="h-10 px-5 text-[11px] font-black uppercase tracking-[0.18em] text-[#04131a] transition-shadow hover:shadow-[0_0_22px_rgb(69_227_255/.5)] disabled:opacity-45"
      style={{ ...plate(8), background: "#45e3ff" }}
    >
      {busy === r.id ? "Scanning chain…" : label}
    </button>
  );
  return (
    <li className="bg-[rgb(255_194_75/.05)] px-4 py-3.5" style={frame(10, done ? "rgb(52 211 153 / .5)" : "rgb(255 194 75 / .3)")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-sans text-[15px] font-semibold text-white">{r.label}</p>
          {r.contract && (
            <p className="mt-1 break-all text-[11.5px] text-[#45e3ff]">
              {r.contract.contractId}
              <span className="text-[rgb(214_219_225/.4)]">::</span>
              {r.contract.methodName}()
            </p>
          )}
          {r.contract?.description && <p className="mt-1 font-sans text-[13px] text-[rgb(214_219_225/.65)]">{r.contract.description}</p>}
        </div>
        <span className={`text-[10.5px] font-black uppercase tracking-[0.18em] ${done ? "text-mint-ink" : r.status === "PENDING_VERIFICATION" ? "text-gold" : r.status === "FAILED" ? "text-danger" : "text-[rgb(214_219_225/.45)]"}`}>
          {done ? "✓ Verified" : r.status === "PENDING_VERIFICATION" ? "Verifying…" : r.status === "FAILED" ? "Not found" : "To do"}
        </span>
      </div>
      {r.reason && !done && <p className="mt-2 font-sans text-[12.5px] text-[rgb(214_219_225/.6)]">{r.reason}</p>}
      {!done && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {partner && (
            <a href={partner.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex h-10 items-center gap-2 px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-white hover:text-orange" style={frame(8, "rgb(167 139 250 / .55)")}>
              🤝 Open {partner.name} ↗
            </a>
          )}
          {r.verification === "onchain" ? (
            <>
              <input className="h-10 w-full max-w-sm bg-[rgb(69_227_255/.05)] px-3 text-[12.5px] text-white placeholder:text-[rgb(214_219_225/.3)] focus:outline-none sm:w-auto sm:flex-1" style={frame(7, "rgb(69 227 255 / .3)")} placeholder="NEAR transaction hash" value={tx} maxLength={64} onChange={(e) => setTx(e.target.value.trim())} />
              {verifyBtn("Verify", tx.length < 43, { txHash: tx })}
            </>
          ) : r.verification === "manual" ? (
            <p className="font-sans text-[12.5px] text-[rgb(214_219_225/.55)]">This activity is reviewed by the project team.</p>
          ) : (
            verifyBtn()
          )}
        </div>
      )}
      {!done && r.verification === "discover" && <p className="mt-2 font-sans text-[11.5px] text-[rgb(214_219_225/.45)]">Do it with the same wallet you signed in with, then press Verify. No transaction hash needed.</p>}
    </li>
  );
}

/** Small helper so the parent can keep the active lock on the first unsealed secret. */
export function useActiveLock(questions: DecryptQuestion[] | null) {
  const firstOpen = useMemo(() => Math.max(0, questions?.findIndex((q) => !q.saved) ?? 0), [questions]);
  const [active, setActive] = useState<number | null>(null);
  return [active ?? firstOpen, setActive] as const;
}

