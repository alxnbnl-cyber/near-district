"use client";

import { frame } from "@/components/explore/frame";
import Link from "next/link";
import { useState } from "react";
import { Button, Field, Notice, buttonClass, inputClass, textareaClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export function ContestEntry({ campaignId, status, signedIn, returnTo }: { campaignId: string; status: string; signedIn: boolean; returnTo: string }) {
  const [form, setForm] = useState({ title: "", body: "", externalUrl: "" });
  const [imageId, setImageId] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <div className="bg-[rgb(8_11_16/.82)] p-6 backdrop-blur-xl md:p-8" style={frame(18, "rgb(214 219 225 / .14)")}>
        <h2 className="font-display text-[24px] font-bold uppercase tracking-[0.02em] text-white">Have an idea?</h2>
        <p className="mt-1 text-sm text-ink-2">Sign in to submit your entry.</p>
        <Link href={`/signin?next=${encodeURIComponent(returnTo)}`} className={buttonClass("primary", "lg", "mt-4")}>
          Sign in to submit your idea
        </Link>
      </div>
    );
  }
  if (status !== "LIVE") {
    return <Notice tone="info">{status === "SCHEDULED" ? "Entries open when the challenge starts." : "This challenge is closed to new entries."}</Notice>;
  }
  if (state === "done") {
    return (
      <Notice tone="ok" title="Entry received">
        Thanks for taking part. The organizer reviews entries after the contest closes; you'll see the result in My Adventures.
      </Notice>
    );
  }
  return (
    <div className="bg-[rgb(8_11_16/.82)] p-6 backdrop-blur-xl md:p-8" style={frame(18, "rgb(214 219 225 / .14)")}>
      <h2 className="font-display text-[24px] font-bold uppercase tracking-[0.02em] text-white">Submit Your Idea</h2>
      <p className="mt-1 text-sm text-ink-2">One entry per person. You can't edit it after sending, so take your time.</p>
      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setState("sending");
          setError(null);
          try {
            await api(`/api/campaigns/${campaignId}/submissions`, { method: "POST", body: { ...form, imageUploadId: imageId } });
            setState("done");
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not submit your entry.");
            setState("idle");
          }
        }}
      >
        <Field label="Title" htmlFor="t">
          <input id="t" required minLength={3} maxLength={120} className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Your idea" htmlFor="b" hint="Plain text, up to 8,000 characters.">
          <textarea id="b" required minLength={20} maxLength={8000} className={`${textareaClass} min-h-44`} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </Field>
        <Field label="Link (optional)" htmlFor="u" hint="A doc, prototype or sketch.">
          <input id="u" type="url" placeholder="https://" className={inputClass} value={form.externalUrl} onChange={(e) => setForm({ ...form, externalUrl: e.target.value })} />
        </Field>
        <Field label="Image (optional)" htmlFor="img" hint="PNG, JPEG or WebP up to 3 MB.">
          <input
            id="img"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const fd = new FormData();
              fd.set("purpose", "submission_image");
              fd.set("file", f);
              setError(null);
              const res = await fetch("/api/uploads", { method: "POST", body: fd });
              const data = await res.json();
              if (!res.ok) setError(data.error ?? "Upload failed.");
              else setImageId(data.id);
            }}
          />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" size="lg" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Submit entry"}
        </Button>
      </form>
    </div>
  );
}
