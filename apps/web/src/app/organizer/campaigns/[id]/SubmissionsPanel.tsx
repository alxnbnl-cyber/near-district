"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, Notice, buttonClass, textareaClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export interface SubmissionRow {
  id: string;
  title: string;
  body: string;
  externalUrl: string | null;
  imageUploadId: string | null;
  status: string;
  author: string;
  averageScore: number | null;
  reviewCount: number;
  createdAt: string;
}

export function SubmissionsPanel({
  campaignId,
  rows,
  criteria,
  ended,
  winnersCount,
}: {
  campaignId: string;
  rows: SubmissionRow[];
  criteria: { key: string; label: string; weightBps: number }[];
  ended: boolean;
  winnersCount: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const hasWinners = rows.some((r) => r.status === "winner");
  const shown = useMemo(() => (filter === "all" ? rows : rows.filter((r) => r.status === filter)), [rows, filter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {["all", "submitted", "shortlisted", "rejected", "winner"].map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`h-7 rounded-full px-3 text-[12.5px] font-medium ${filter === f ? "bg-orange-wash text-orange-ink ring-1 ring-orange/50" : "bg-paper-2 text-ink-2"}`}>
            {f[0]!.toUpperCase() + f.slice(1)} ({f === "all" ? rows.length : rows.filter((r) => r.status === f).length})
          </button>
        ))}
        <a href={`/api/organizer/campaigns/${campaignId}/export`} className={buttonClass("secondary", "sm", "ml-auto")}>
          Export CSV
        </a>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {shown.length === 0 && <p className="text-sm text-ink-3">No entries here.</p>}
      <ul className="flex flex-col gap-2">
        {shown.map((s) => (
          <li key={s.id} className="rounded-md border border-line bg-paper">
            <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
              {ended && !hasWinners && s.status !== "rejected" && (
                <input
                  type="checkbox"
                  aria-label={`Select ${s.title} as a winner`}
                  checked={picked.includes(s.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))}
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{s.title}</span>
                <span className="text-[12.5px] text-ink-3">by {s.author}</span>
              </span>
              {s.averageScore !== null && <span className="font-display text-sm font-semibold tabular">{(s.averageScore / 100).toFixed(2)}</span>}
              <Badge tone={s.status === "winner" ? "mint" : s.status === "shortlisted" ? "sky" : s.status === "rejected" ? "danger" : "neutral"}>{s.status}</Badge>
            </button>
            {open === s.id && <ReviewForm campaignId={campaignId} s={s} criteria={criteria} onSaved={() => router.refresh()} />}
          </li>
        ))}
      </ul>
      {ended && !hasWinners && (
        <div className="flex items-center gap-3 border-t border-line pt-3">
          <Button
            disabled={picked.length === 0 || picked.length > winnersCount}
            onClick={async () => {
              if (!confirm(`Lock in ${picked.length} winner(s)? This can't be undone.`)) return;
              try {
                await api(`/api/organizer/campaigns/${campaignId}/winners`, { method: "POST", body: { submissionIds: picked } });
                setMsg({ tone: "ok", text: "Winners selected." });
                router.refresh();
              } catch (e) {
                setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Could not save winners." });
              }
            }}
          >
            Confirm {picked.length}/{winnersCount} winners
          </Button>
          <p className="text-[12.5px] text-ink-3">Your decision is recorded in the audit log.</p>
        </div>
      )}
      {!ended && <p className="text-[12.5px] text-ink-3">You can score entries now. Winners are chosen after the contest closes.</p>}
    </div>
  );
}

function ReviewForm({ campaignId, s, criteria, onSaved }: { campaignId: string; s: SubmissionRow; criteria: { key: string; label: string; weightBps: number }[]; onSaved: () => void }) {
  const [scores, setScores] = useState<Record<string, number>>(Object.fromEntries(criteria.map((c) => [c.key, 5])));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const weighted = criteria.reduce((a, c) => a + (scores[c.key] ?? 0) * c.weightBps, 0) / 10_000;
  const send = async (decision: "shortlist" | "reject" | "none") => {
    setError(null);
    try {
      await api(`/api/organizer/campaigns/${campaignId}/submissions/${s.id}`, { method: "POST", body: { scores, privateNote: note || undefined, decision } });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the review.");
    }
  };
  return (
    <div className="border-t border-line px-4 py-4">
      <p className="whitespace-pre-line text-sm leading-relaxed">{s.body}</p>
      {s.externalUrl && (
        <a href={s.externalUrl} target="_blank" rel="noopener noreferrer nofollow ugc" className="mt-2 inline-block text-sm font-semibold text-orange-ink hover:underline">
          {s.externalUrl} ↗
        </a>
      )}
      {s.imageUploadId && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/uploads/${s.imageUploadId}`} alt="Submission attachment" className="mt-3 max-h-72 rounded border border-line" />
      )}
      {s.status !== "winner" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {criteria.map((c) => (
            <label key={c.key} className="text-[13px]">
              <span className="font-semibold">{c.label}</span> <span className="text-ink-3">({c.weightBps / 100}%)</span>
              <input type="range" min={0} max={10} step={1} value={scores[c.key]} onChange={(e) => setScores({ ...scores, [c.key]: Number(e.target.value) })} className="mt-1 w-full accent-[var(--color-orange-deep)]" />
              <span className="tabular">{scores[c.key]}/10</span>
            </label>
          ))}
        </div>
      )}
      {s.status !== "winner" && (
        <>
          <textarea className={`${textareaClass} mt-3 min-h-16`} placeholder="Private note (only your team sees this)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="mr-2 text-sm font-semibold tabular">Weighted {weighted.toFixed(2)}/10</span>
            <Button size="sm" onClick={() => send("none")}>Save score</Button>
            <Button size="sm" variant="secondary" onClick={() => send("shortlist")}>Shortlist</Button>
            <Button size="sm" variant="ghost" onClick={() => send("reject")}>Reject</Button>
          </div>
        </>
      )}
      {error && <div className="mt-2"><Notice tone="danger">{error}</Notice></div>}
    </div>
  );
}
