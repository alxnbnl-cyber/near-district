"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Notice, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Review {
  id: string;
  status: "under_review" | "verified" | "failed" | "pending";
  player: string;
  campaign: string;
  hint: string;
  instructions: string;
  submission: { text?: string; link?: string | null };
  reviewNote: string | null;
  createdAt: string;
}

/** Manual activity reviews for activities your organization owns (including ones partners use). */
export function ReviewsPanel() {
  const [rows, setRows] = useState<Review[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => setRows(await api<Review[]>("/api/organizer/reviews")), []);
  useEffect(() => {
    void load().catch((e) => setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Could not load reviews." }));
  }, [load]);

  const decide = async (id: string, decision: "approve" | "reject") => {
    setBusy(id);
    setMsg(null);
    try {
      await api(`/api/organizer/reviews/${id}`, { method: "POST", body: { decision, note: notes[id] ?? "" } });
      setMsg({ tone: "ok", text: decision === "approve" ? "Approved — the player's hint requirement is verified." : "Rejected. The player can see your note." });
      await load();
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Could not save the decision." });
    } finally {
      setBusy(null);
    }
  };

  const open = rows.filter((r) => r.status === "under_review");
  const done = rows.filter((r) => r.status !== "under_review");
  return (
    <div className="flex flex-col gap-4">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {open.length === 0 && <EmptyState title="Nothing to review">Submissions for your manual-review activities appear here.</EmptyState>}
      {open.map((r) => (
        <Card key={r.id} className="p-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">
            {r.campaign} · hint “{r.hint}”
          </p>
          <p className="mt-1 text-[13px] text-ink-3">Asked: {r.instructions}</p>
          <blockquote className="mt-3 whitespace-pre-line rounded-md border-l-[3px] border-orange bg-paper px-4 py-3 text-[14px]">{r.submission.text}</blockquote>
          {r.submission.link && (
            <a href={r.submission.link} target="_blank" rel="noopener noreferrer nofollow ugc" className="mt-2 inline-block text-[13px] font-semibold text-orange-ink hover:underline">
              Open submitted link ↗
            </a>
          )}
          <p className="mt-2 text-[12px] text-ink-3">
            From {r.player} · {new Date(r.createdAt).toLocaleString()}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input className={inputClass} placeholder="Note to the player (optional)" maxLength={1000} value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
            <Button disabled={busy !== null} onClick={() => decide(r.id, "approve")}>Approve</Button>
            <Button variant="secondary" disabled={busy !== null} onClick={() => decide(r.id, "reject")}>Reject</Button>
          </div>
        </Card>
      ))}
      {done.length > 0 && (
        <details className="text-[13px]">
          <summary className="cursor-pointer text-ink-3">Decided ({done.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {done.map((r) => (
              <li key={r.id} className="text-ink-3">
                {r.player} · {r.hint} · <Badge tone={r.status === "verified" ? "mint" : "danger"}>{r.status === "verified" ? "Approved" : "Rejected"}</Badge>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
