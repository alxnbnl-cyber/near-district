"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonClass, inputClass, textareaClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export type HintStatus = "LOCKED" | "AVAILABLE" | "PENDING_VERIFICATION" | "UNDER_REVIEW" | "UNLOCKED" | "FAILED";

export interface HintRequirement {
  id: string;
  label: string;
  type: string;
  category: string;
  verification: "automatic" | "onchain" | "discover" | "manual";
  contract: { contractId: string; methodName: string; description: string | null; partner: { name: string; url: string } | null } | null;
  provider: { orgName: string; spaceSlug: string | null; spaceName: string | null };
  target: { spaceSlug: string; campaignSlug: string; title: string } | null;
  status: "TODO" | "PENDING_VERIFICATION" | "UNDER_REVIEW" | "VERIFIED" | "FAILED";
  reason: string | null;
  reviewNote: string | null;
  instructions: string | null;
  requireLink: boolean;
}

export interface HintCard {
  id: string;
  title: string;
  teaser: string;
  status: HintStatus;
  op: "ANY" | "ALL" | null;
  free: boolean;
  lockReason: "not_yet" | "expired" | "partner_withdrawn" | null;
  availableFrom: string | null;
  content: string | null;
  imageUrl: string | null;
  requirements: HintRequirement[];
}

const STATUS: Record<HintStatus, { label: string; cls: string }> = {
  LOCKED: { label: "Locked", cls: "bg-paper-2 text-ink-3" },
  AVAILABLE: { label: "Available", cls: "bg-sky-wash text-sky-ink" },
  PENDING_VERIFICATION: { label: "Verifying", cls: "bg-gold-wash text-gold-ink" },
  UNDER_REVIEW: { label: "Under review", cls: "bg-violet-wash text-violet-ink" },
  UNLOCKED: { label: "Unlocked", cls: "bg-mint-wash text-mint-ink" },
  FAILED: { label: "Not verified", cls: "bg-danger-wash text-danger" },
};

const REQ_STATUS: Record<HintRequirement["status"], { label: string; cls: string }> = {
  TODO: { label: "To do", cls: "text-ink-3" },
  PENDING_VERIFICATION: { label: "Verifying…", cls: "text-gold-ink" },
  UNDER_REVIEW: { label: "Under review", cls: "text-violet-ink" },
  VERIFIED: { label: "Verified ✓", cls: "text-mint-ink" },
  FAILED: { label: "Not verified", cls: "text-danger" },
};

const VERIFY_LABEL = { automatic: "Checked instantly", onchain: "Checked on NEAR", discover: "Checked on NEAR from your wallet", manual: "Approved by the project team" };

function LockIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d={open ? "M8 11V7a4 4 0 0 1 7.5-2" : "M8 11V7a4 4 0 0 1 8 0v4"} />
    </svg>
  );
}

/** "Need a hint?" — optional clues. Locked clue text never reaches the browser. */
export function HintCards({ campaignId, hints, returnTo, onChange }: { campaignId: string; hints: HintCard[]; returnTo: string; onChange(h: HintCard[]): void }) {
  if (!hints.length) return null;
  return (
    <section aria-labelledby="hints-title" className="mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="hints-title" className="text-[15px] font-semibold">Need a hint?</h3>
        <p className="text-[12px] text-ink-3">Optional — do an activity to reveal a hint.</p>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {hints.map((h) => (
          <li key={h.id}>
            <HintItem campaignId={campaignId} h={h} returnTo={returnTo} onChange={onChange} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function HintItem({ campaignId, h, returnTo, onChange }: { campaignId: string; h: HintCard; returnTo: string; onChange(h: HintCard[]): void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "danger"; text: string } | null>(null);
  const [open, setOpen] = useState(h.status !== "UNLOCKED");
  const s = STATUS[h.status];
  const unlocked = h.status === "UNLOCKED";

  const call = async (key: string, path: string, body?: unknown) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await api<{ hints: HintCard[]; outcome?: { status: string; message: string | null; unlocked: boolean } }>(path, { method: "POST", body: body ?? {} });
      onChange(r.hints);
      if (r.outcome) {
        const o = r.outcome;
        setMsg(
          o.unlocked
            ? { tone: "ok", text: "Verified — hint unlocked." }
            : o.status === "verified"
              ? { tone: "ok", text: "Verified. Complete the remaining requirement to unlock." }
              : o.status === "pending"
                ? { tone: "warn", text: o.message ?? "Waiting for confirmation. We'll keep checking automatically." }
                : o.status === "under_review"
                  ? { tone: "warn", text: "Submitted. The organizer will review it." }
                  : { tone: "danger", text: o.message ?? "We couldn't verify that yet." },
        );
      }
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Something went wrong. Your progress is safe." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`overflow-hidden rounded-[14px] border ${unlocked ? "border-mint/50" : "border-line"} bg-paper`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${unlocked ? "bg-mint-wash text-mint-ink" : h.free ? "bg-sky-wash text-sky-ink" : "bg-orange-wash text-orange-ink"}`}>
          <LockIcon open={unlocked || h.status === "AVAILABLE"} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{h.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${s.cls}`}>{s.label}</span>
          </span>
          {h.teaser && <span className="mt-0.5 block text-[13px] text-ink-3">{h.teaser}</span>}
          {!h.free && h.requirements[0] && (
            <span className="mt-0.5 block text-[12px] text-ink-3">
              Provided by <span className="font-medium text-ink-2">{[...new Set(h.requirements.map((r) => r.provider.orgName))].join(", ")}</span>
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          {unlocked ? (
            <div className="rounded-[10px] border-l-[3px] border-orange bg-orange-wash/40 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-ink">Hint</p>
              <p className="mt-1 whitespace-pre-line text-[14.5px] text-ink">{h.content}</p>
              {h.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.imageUrl} alt="Image for this hint" className="mt-3 max-h-64 rounded-md border border-line object-contain" />
              )}
            </div>
          ) : h.lockReason ? (
            <p className="text-[13px] text-ink-3">
              {h.lockReason === "not_yet"
                ? `This hint opens ${h.availableFrom ? new Date(h.availableFrom).toLocaleString() : "later"}.`
                : h.lockReason === "expired"
                  ? "This hint is no longer available."
                  : "The partner activity behind this hint was withdrawn, so it can't be unlocked right now."}
            </p>
          ) : h.free ? (
            <Button size="sm" disabled={busy !== null} onClick={() => call("reveal", `/api/campaigns/${campaignId}/hints/${h.id}/reveal`)}>
              {busy ? "Opening…" : "Reveal hint"}
            </Button>
          ) : (
            <>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                {h.requirements.length > 1 ? (h.op === "ALL" ? "Complete all of these" : "Complete any one of these") : "Requirement"}
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {h.requirements.map((r) => (
                  <Requirement key={r.id} r={r} busy={busy} returnTo={returnTo} onVerify={(body) => call(r.id, `/api/campaigns/${campaignId}/hints/${h.id}/verify`, { leafId: r.id, ...body })} />
                ))}
              </ul>
            </>
          )}
          {msg && (
            <p role="status" className={`mt-3 text-[13px] ${msg.tone === "ok" ? "text-mint-ink" : msg.tone === "warn" ? "text-gold-ink" : "text-danger"}`}>
              {msg.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Requirement({ r, busy, returnTo, onVerify }: { r: HintRequirement; busy: string | null; returnTo: string; onVerify(body: Record<string, unknown>): void }) {
  const [tx, setTx] = useState("");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const st = REQ_STATUS[r.status];
  const done = r.status === "VERIFIED";
  const exploreHref = r.provider.spaceSlug ? `/explore?space=${encodeURIComponent(r.provider.spaceSlug)}&back=${encodeURIComponent(returnTo)}` : null;
  return (
    <li className="rounded-[10px] border border-line bg-card px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[14px] font-medium">{r.label}</p>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {r.provider.spaceName ?? r.provider.orgName} · {VERIFY_LABEL[r.verification]}
          </p>
        </div>
        <span className={`text-[12px] font-semibold ${st.cls}`}>{st.label}</span>
      </div>
      {r.reason && !done && <p className="mt-1.5 text-[12.5px] text-ink-3">{r.reason}</p>}
      {r.reviewNote && <p className="mt-1 text-[12.5px] text-ink-3">Reviewer: “{r.reviewNote}”</p>}

      {!done && (
        <div className="mt-3 flex flex-col gap-2">
          {r.verification === "onchain" && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor={`tx-${r.id}`}>Transaction hash</label>
              <input id={`tx-${r.id}`} className={`${inputClass} font-mono text-[12.5px]`} placeholder="NEAR transaction hash" value={tx} maxLength={64} onChange={(e) => setTx(e.target.value.trim())} />
              <Button size="md" disabled={busy !== null || tx.length < 43} onClick={() => onVerify({ txHash: tx })}>
                {busy === r.id ? "Checking chain…" : "Verify activity"}
              </Button>
            </div>
          )}
          {r.verification === "manual" && r.status !== "UNDER_REVIEW" && (
            <>
              {r.instructions && r.instructions !== r.label && <p className="text-[13px] text-ink-2">{r.instructions}</p>}
              <label className="sr-only" htmlFor={`sub-${r.id}`}>Your submission</label>
              <textarea id={`sub-${r.id}`} className={`${textareaClass} min-h-20`} maxLength={4000} placeholder="Your contribution" value={text} onChange={(e) => setText(e.target.value)} />
              <input className={inputClass} placeholder={r.requireLink ? "Link to your work (required)" : "Link (optional)"} value={link} maxLength={500} onChange={(e) => setLink(e.target.value.trim())} />
              <Button size="sm" className="self-start" disabled={busy !== null || text.trim().length < 10 || (r.requireLink && !link)} onClick={() => onVerify({ submission: { text, ...(link ? { link } : {}) } })}>
                {busy === r.id ? "Submitting…" : "Submit for review"}
              </Button>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {r.target && (
              <Link href={`/explore?m=${r.target.spaceSlug}%2F${r.target.campaignSlug}`} className={buttonClass("secondary", "sm")}>
                Open “{r.target.title}”
              </Link>
            )}
            {exploreHref && (
              <Link href={exploreHref} className={buttonClass("dark", "sm")}>
                Visit {r.provider.spaceName ?? "partner"}
              </Link>
            )}
            {(r.verification === "automatic" || r.verification === "discover") && (
              <Button size="sm" disabled={busy !== null} onClick={() => onVerify({})}>
                {busy === r.id ? "Checking…" : "Verify activity"}
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

