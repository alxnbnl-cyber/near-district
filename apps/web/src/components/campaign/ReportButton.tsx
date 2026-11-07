"use client";

import { useState } from "react";
import { Button, Field, Notice, inputClass, textareaClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

const REASONS = [
  ["spam", "Spam"],
  ["abuse", "Abusive content"],
  ["impersonation", "Impersonation"],
  ["copyright", "Copyright"],
  ["malicious_link", "Malicious link"],
  ["unfair_campaign", "Unfair or misleading campaign"],
  ["other", "Something else"],
] as const;

export function ReportButton({ targetType, targetId }: { targetType: "space" | "campaign" | "submission"; targetId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("spam");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Report
      </Button>
    );
  }
  return (
    <div role="dialog" aria-label="Report content" className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Report this {targetType}</h2>
        {state === "done" ? (
          <div className="mt-3">
            <Notice tone="ok">Thanks — our moderators will take a look.</Notice>
            <Button className="mt-4" variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        ) : (
          <form
            className="mt-4 flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setState("sending");
              setError(null);
              try {
                await api("/api/reports", { method: "POST", body: { targetType, targetId, reason, details } });
                setState("done");
              } catch (err) {
                setError(err instanceof ApiError ? (err.status === 401 ? "Please sign in to report." : err.message) : "Could not send the report.");
                setState("idle");
              }
            }}
          >
            <Field label="Reason" htmlFor="reason">
              <select id="reason" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Details (optional)" htmlFor="details">
              <textarea id="details" className={textareaClass} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} />
            </Field>
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="flex gap-2">
              <Button type="submit" disabled={state === "sending"}>
                Send report
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
