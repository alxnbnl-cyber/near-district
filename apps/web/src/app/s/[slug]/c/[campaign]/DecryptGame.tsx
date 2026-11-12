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
const COLOR: Record<LockState, string> = { locked: "#5ad1ff", sealed: "#FFC24B", correct: "#34d399", wrong: "#f87171" };
const G = "#5ad1ff";
const PRIMARY =
  "inline-flex items-center justify-center gap-2 bg-[linear-gradient(180deg,#ffa458,#ff8a2a)] px-6 font-mono font-black uppercase tracking-[0.18em] text-[#140c05] shadow-[0_0_24px_rgb(255_145_56/.35)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_0_36px_rgb(255_145_56/.6)] disabled:translate-y-0 disabled:opacity-45";
const SECONDARY =
  "inline-flex items-center justify-center gap-2 px-5 font-mono font-bold uppercase tracking-[0.16em] text-[rgb(214_219_225/.8)] transition-colors hover:text-white disabled:opacity-30";
const OUTLINE = "rgb(214 219 225 / .25)";
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
      <span className="absolute -bottom-4 font-mono text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: c }}>
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
      @keyframes dg-trace { to { stroke-dashoffset: -8 } }
      .dg-trace { animation: dg-trace 1.4s linear infinite }
      @keyframes dg-ping { 0% { transform: translate(-50%,-50%) scale(.6); opacity: .9 } 100% { transform: translate(-50%,-50%) scale(1.6); opacity: 0 } }
      .dg-ping { animation: dg-ping 2.4s ease-out infinite }
      @keyframes dg-swap { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
      .dg-swap { animation: dg-swap 380ms cubic-bezier(.2,.8,.2,1) both }
      @keyframes dg-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
      .dg-bob { animation: dg-bob 2.6s ease-in-out infinite }
      @keyframes dg-pop { 0% { transform: scale(.8); opacity: 0 } 60% { transform: scale(1.08); opacity: 1 } 100% { transform: scale(1) } }
      .dg-pop { animation: dg-pop 320ms cubic-bezier(.2,.8,.2,1) both }
      @keyframes dg-flow { to { background-position: 24px 0 } }
      .dg-flow { background-size: 24px 2px; animation: dg-flow 1.2s linear infinite }
      @keyframes dg-scan { 0% { transform: translateY(-100%) } 100% { transform: translateY(100%) } }
      .dg-scan::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent, rgb(69 227 255 / .06), transparent); animation: dg-scan 3.5s linear infinite; pointer-events: none }
      @keyframes dg-stamp { 0% { opacity: 0; transform: scale(1.8) rotate(-10deg) } 45% { opacity: 1; transform: scale(.95) rotate(-5deg) } 100% { opacity: 1; transform: scale(1) rotate(-5deg) } }
      .dg-stamp { animation: dg-stamp 420ms cubic-bezier(.2,.8,.2,1) both }
      @media (prefers-reduced-motion: reduce) { .dg-spin, .dg-spin-rev, .dg-orbit, .dg-pulse, .dg-flow, .dg-scan::after, .dg-stamp, .dg-trace, .dg-ping, .dg-bob, .dg-pop, .dg-swap { animation: none } }
    `}</style>
  );
}

export function lockStateOf(q: DecryptQuestion, closed: boolean): LockState {
  if (closed) return q.result?.correct ? "correct" : "wrong";
  return q.saved ? "sealed" : "locked";
}

/** Hacker-terminal window: title bar with name and fake window controls. */
export function TermWindow({ title, right, children, tone = G, className = "" }: { title: string; right?: React.ReactNode; children: React.ReactNode; tone?: string; className?: string }) {
  return (
    <section className={`relative font-mono ${className}`}>
      <div className="flex items-center gap-2 py-1">
        <span className="text-[12px] font-black uppercase tracking-[0.16em]" style={{ color: tone }}>{title}</span>
        {right && <span className="ml-auto">{right}</span>}
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}

/** Land mask (64×30) derived from /assets/map-bg.webp, so locks always sit on a continent. */
const WORLD = [
  "................................................................",
  "................................................................",
  "................................................................",
  "..................xxxxxxxxx.................x...................",
  "..............x.xxxxxxxxxxx....x.............xx....x............",
  ".......xx...xxx.xxx...xxxxx...........x..xxxxxxxxx..x...........",
  "......xxxxxxxxx.xxxx..xxxx......xxxx.xxxxxxxxxxxxxxxxxxxxx......",
  "......xxxxxxxxxxxx.xx.xx..x....xxxxxxxxxxxxxxxxxxxxxxxxxxx......",
  "......xxxxxxxxxx..xx........x.xxxxxxxxxxxxxxxxxxxxxxxxxxx.......",
  "......x...xxxxxxxxxxx......xxxxxxxxxxxxxxxxxxxxxxxxxx..x........",
  "..........xxxxxxxxxx.x.......xxxxxxxxxxxxxxxxxxxxxxxxx..........",
  "...........xxxxxxxxx........xxxxxx.xxxxxxxxxxxxxxxxx.x..........",
  "...........xxxxxxx..........xx...xxxxxxxxxxxxxxxxxx.x...........",
  "...........xxxxxx...........xxxx.x.xxxxxxxxxxxxxxx.xx...........",
  "............xxx............xxxxxxxxxxxxxxxxxxxxxxx..............",
  ".............xxx..x.......xxxxxxxxxxxxx..xx..xx..x..............",
  ".................xxx......xxxxxxxxxxxx...xx..xxx................",
  ".................xxxxx.....xxxxxxxxxxx....x..x..x.x.............",
  "................xxxxxxxx......xxxxxx.........xxxxx.xxx..........",
  ".................xxxxxxx.......xxxxx...........x.....xx.........",
  ".................xxxxxx........xxxxx.x............xx.x..........",
  "..................xxxxx........xxxx.xx..........xxxxxx..........",
  "..................xxx..........xxxx.x...........xxxxxxx.........",
  ".................xxxx...........xx..............xxxxxxx.........",
  ".................xx.................................xx...x......",
  ".................xx.....................................x.......",
  "..................x.............................................",
  "................................................................",
  "................................................................",
  "................................................................",
];
const MW = 64, MH = WORLD.length;
const LAND: [number, number][] = WORLD.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "x" ? [[x, y] as [number, number]] : [])));

/** Deterministic, spread-out spots on land for each lock (same every visit). */
function lockSpots(seed: string, n: number): [number, number][] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0), (h >>> 0) / 4294967296);
  const inner = LAND.filter(([x, y]) => x > 7 && x < MW - 8 && y > 2 && y < MH - 3);
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let best: [number, number] = inner[Math.floor(rnd() * inner.length)]!;
    let bestD = -1;
    for (let t = 0; t < 24; t++) {
      const c = inner[Math.floor(rnd() * inner.length)]!;
      const d = out.length ? Math.min(...out.map(([x, y]) => Math.hypot(x - c[0], (y - c[1]) * 1.6))) : 1;
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
    out.push(best);
  }
  return out;
}

/** World-map "trace" scene: locks scattered across the map, joined by a hacked route. */
export function LockGrid({ questions, total, closed, active, onPick }: { questions: DecryptQuestion[]; total: number; closed: boolean; active: number; onPick(i: number): void }) {
  const spots = useMemo(() => lockSpots(questions.map((q) => q.id).join("|") || String(total), total), [questions, total]);
  const pct = ([x, y]: [number, number]) => ({ left: `${((x + 0.5) / MW) * 100}%`, top: `${((y + 0.5) / MH) * 100}%` });
  const route = spots.map(([x, y], i) => {
    if (i === 0) return `M${x + 0.5} ${y + 0.5}`;
    const [px, py] = spots[i - 1]!;
    const mx = (px + x) / 2 + 0.5, my = Math.min(py, y) - 3 + 0.5;
    return `Q${mx} ${my} ${x + 0.5} ${y + 0.5}`;
  }).join(" ");
  return (
    <div className="relative mx-auto aspect-[64/30] w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/map-bg.webp" alt="" aria-hidden className="pointer-events-none absolute inset-0 size-full select-none rounded-[14px] object-fill" draggable={false} />
      <svg viewBox={`0 0 ${MW} ${MH}`} preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
        {/* graticule */}
                {spots.length > 1 && (
          <>
            <path d={route} fill="none" stroke="#FF9138" strokeOpacity=".22" strokeWidth=".5" strokeLinecap="round" />
            <path d={route} fill="none" stroke="#FFC24B" strokeWidth=".28" strokeDasharray=".9 .9" strokeLinecap="round" className="dg-trace" />
            <circle r=".6" fill="#FFC24B">
              <animateMotion dur={`${2 + total}s`} repeatCount="indefinite" path={route} />
            </circle>
          </>
        )}
      </svg>
      {spots.map((p, i) => {
        const q = questions[i];
        const st = q ? lockStateOf(q, closed) : "locked";
        return (
          <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={pct(p)}>
            <span aria-hidden className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full dg-ping" style={{ boxShadow: `0 0 0 1px ${COLOR[st]}66` }} />
            <span className="dg-bob block" style={{ animationDelay: `${i * 0.35}s` }}>
              <LockSphere state={st} index={i} active={i === active} size={i === active ? 66 : 54} onClick={() => onPick(i)} />
            </span>
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
    <TermWindow
      className="dg-swap"
      title={`Lock ${pad(q.index + 1)} of ${pad(total)}`}
      tone={c}
      right={
        <span className="flex gap-1">
          <button type="button" onClick={() => onNav(-1)} disabled={q.index === 0} aria-label="Previous secret" className={`${SECONDARY} h-8 px-3 text-[10.5px]`} style={frame(7, OUTLINE)}>
            ‹ Prev
          </button>
          <button type="button" onClick={() => onNav(1)} disabled={q.index === total - 1} aria-label="Next secret" className={`${SECONDARY} h-8 px-3 text-[10.5px]`} style={frame(7, OUTLINE)}>
            Next ›
          </button>
        </span>
      }
    >
      {flash && <span className="dg-stamp absolute right-5 top-4 z-10 border-2 border-reward px-3 py-1 text-[11px] font-black uppercase tracking-[0.3em] text-reward">Sealed</span>}
      <div className="pt-2">
        <span key={statusText} className="dg-pop inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10.5px] font-black uppercase tracking-[0.16em]" style={{ background: `${c}22`, color: c }}>
          {closed ? (q.result?.correct ? "Unlocked!" : "Not this time") : q.saved ? "Answer locked in" : "Waiting for your answer"}
        </span>
      </div>
      <div className="relative pb-2 pt-3">
        <h3 className="whitespace-pre-line font-display text-[21px] font-bold leading-snug text-white md:text-[25px]">{q.prompt}</h3>
        {q.clue && <p className="mt-2 font-sans text-[14px] italic text-[rgb(214_219_225/.65)]">{q.clue}</p>}
        {q.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={q.imageUrl} alt="Image for this secret" className="mt-3 max-h-72 border border-[rgb(255_255_255/.1)] object-contain" />
        )}
        {q.referenceUrl && (
          <a href={q.referenceUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block text-[11px] font-bold uppercase tracking-[0.12em] text-[#5ad1ff] hover:underline">
            Look closer ↗
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
                      className={`flex items-center gap-3 px-4 py-3.5 text-left font-sans text-[15px] text-white transition-[transform,background] hover:-translate-y-0.5 disabled:opacity-50 ${picked ? "bg-[rgb(255_145_56/.12)]" : "bg-[rgb(255_255_255/.03)] hover:bg-[rgb(255_145_56/.06)]"}`}
                      style={frame(10, picked ? "rgb(255 145 56 / .75)" : OUTLINE)}
                    >
                      <span className={`grid size-8 shrink-0 place-items-center font-mono text-[13px] font-black ${picked ? "bg-orange text-[#140c05]" : "bg-[rgb(255_255_255/.06)] text-[rgb(214_219_225/.8)]"}`}>{picked ? "✓" : String.fromCharCode(65 + i)}</span>
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
                <div className="flex h-14 flex-1 items-center gap-3 bg-[rgb(255_255_255/.04)] px-4 focus-within:bg-[rgb(255_145_56/.06)]" style={frame(11, OUTLINE)}>
                  <input
                    id={`a-${q.id}`}
                    autoComplete="off"
                    spellCheck={false}
                    inputMode={q.type === "numeric" ? "decimal" : "text"}
                    className="h-full w-full bg-transparent font-sans text-[17px] text-white caret-[#FF9138] placeholder:text-[rgb(214_219_225/.35)] focus:outline-none"
                    placeholder="Type your answer…"
                    value={value}
                    maxLength={500}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !value.trim() || !dirty}
                  className={`${PRIMARY} h-14 shrink-0 px-7 text-[12.5px]`}
                  style={plate(11)}
                >
                  {busy ? "Locking…" : q.saved ? (dirty ? "Update" : "Locked in") : "Lock it in"}
                </button>
              </form>
            )}
            <p className="mt-3 min-h-5 font-sans text-[13px]" aria-live="polite">
              {msg ? <span className={`dg-pop inline-block font-bold ${msg.tone === "ok" ? "text-gold" : "text-danger"}`}>{msg.text}</span> : <span className="text-[rgb(214_219_225/.45)]">You can change your answer until the deadline. Results are revealed then.</span>}
            </p>
            {q.hints.map((h) => (
              <Intel key={h.id} campaignId={campaignId} h={h} onChange={onHints} />
            ))}
          </div>
        )}
      </div>
    </TermWindow>
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
    <TermWindow className="mt-10 border-t border-[rgb(255_194_75/.25)] pt-7" tone="#FFC24B" title={unlocked ? "Hint unlocked!" : h.status === "PENDING_VERIFICATION" ? "Hint · checking…" : "Bonus quest: unlock a hint"}>
      <div className="pt-2">

      {unlocked ? (
        <div className="dg-pop mt-2 rounded-[12px] bg-[rgb(52_211_153/.1)] px-4 py-3">
          <Scramble text={h.content ?? ""} className="block whitespace-pre-line font-sans text-[15px] leading-relaxed text-white" />
          {h.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={h.imageUrl} alt="" className="mt-3 max-h-64 border border-[rgb(255_255_255/.1)] object-contain" />
          )}
        </div>
      ) : h.lockReason ? (
        <p className="mt-2 font-sans text-[13px] text-[rgb(214_219_225/.55)]">{h.lockReason === "not_yet" ? "This intel unlocks later." : "This intel can't be unlocked right now."}</p>
      ) : h.free ? (
        <button type="button" disabled={busy !== null} onClick={() => call("reveal", `/api/campaigns/${campaignId}/hints/${h.id}/reveal`)} className={`${PRIMARY} mt-3 h-11 text-[11.5px]`} style={plate(9)}>
          {busy ? "Decrypting…" : "Decrypt intel"}
        </button>
      ) : (
        <>
          <p className="font-sans text-[13.5px] text-[rgb(214_219_225/.7)]">Stuck? Complete {h.requirements.length > 1 ? (h.op === "ALL" ? "these activities" : "one of these activities") : "this activity"} on NEAR and the hint is yours.</p>
          <ul className="mt-5 flex flex-col gap-3">
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
        <p role="status" className={`mt-3 text-[12px] ${msg.tone === "ok" ? "text-mint-ink" : msg.tone === "warn" ? "text-gold" : "text-danger"} font-sans font-bold`}>
          {msg.text}
        </p>
      )}
      </div>
    </TermWindow>
  );
}

function Activity({ r, busy, tx, setTx, onVerify }: { r: HintRequirement; busy: string | null; tx: string; setTx(v: string): void; onVerify(body: Record<string, unknown>): void }) {
  const done = r.status === "VERIFIED";
  const partner = r.contract?.partner ?? null;
  const verifyBtn = (label = "I did it", disabled = false, body: Record<string, unknown> = {}) => (
    <button
      type="button"
      disabled={busy !== null || disabled}
      onClick={() => onVerify(body)}
      className={`${PRIMARY} h-11 text-[11.5px]`}
      style={plate(9)}
      
    >
      {busy === r.id ? "Checking…" : label}
    </button>
  );
  return (
    <li className="bg-[rgb(255_194_75/.04)] px-5 py-5" style={frame(12, done ? "rgb(52 211 153 / .5)" : "rgb(255 194 75 / .3)")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-sans text-[15px] font-semibold text-white">{r.label}</p>
          {r.contract && (
            <p className="mt-1 break-all text-[11px] text-[rgb(214_219_225/.5)]">
              {r.contract.contractId}
              <span className="text-[rgb(214_219_225/.4)]">::</span>
              {r.contract.methodName}()
            </p>
          )}
          {r.contract?.description && <p className="mt-1 font-sans text-[13px] text-[rgb(214_219_225/.65)]">{r.contract.description}</p>}
        </div>
        <span className={`text-[10.5px] font-black uppercase tracking-[0.18em] ${done ? "text-mint-ink" : r.status === "PENDING_VERIFICATION" ? "text-gold" : r.status === "FAILED" ? "text-danger" : "text-[rgb(214_219_225/.45)]"}`}>
          {done ? "Done" : r.status === "PENDING_VERIFICATION" ? "Checking…" : r.status === "FAILED" ? "Not yet" : "To do"}
        </span>
      </div>
      {r.reason && !done && <p className="mt-2 font-sans text-[12.5px] text-[rgb(214_219_225/.6)]">{r.reason}</p>}
      {!done && (
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {partner && (
            <a href={partner.url} target="_blank" rel="noopener noreferrer nofollow" className={`${SECONDARY} h-11 text-[11px]`} style={frame(9, OUTLINE)}>
              Open {partner.name} ↗
            </a>
          )}
          {r.verification === "onchain" ? (
            <>
              <input className="h-10 w-full max-w-sm bg-[rgb(69_227_255/.05)] px-3 text-[12.5px] text-white placeholder:text-[rgb(214_219_225/.3)] focus:outline-none sm:w-auto sm:flex-1" style={frame(7, "rgb(69 227 255 / .3)")} placeholder="NEAR transaction hash" value={tx} maxLength={64} onChange={(e) => setTx(e.target.value.trim())} />
              {verifyBtn("Check", tx.length < 43, { txHash: tx })}
            </>
          ) : r.verification === "manual" ? (
            <p className="font-sans text-[12.5px] text-[rgb(214_219_225/.55)]">This activity is reviewed by the project team.</p>
          ) : (
            verifyBtn()
          )}
        </div>
      )}
      {!done && r.verification === "discover" && <p className="mt-2 font-sans text-[11.5px] text-[rgb(214_219_225/.45)]">Use the same wallet you signed in with, then tap “I did it”. We check NEAR for you.</p>}
    </li>
  );
}

/** Small helper so the parent can keep the active lock on the first unsealed secret. */
export function useActiveLock(questions: DecryptQuestion[] | null) {
  const firstOpen = useMemo(() => Math.max(0, questions?.findIndex((q) => !q.saved) ?? 0), [questions]);
  const [active, setActive] = useState<number | null>(null);
  return [active ?? firstOpen, setActive] as const;
}

