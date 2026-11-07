"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, Field, Notice, inputClass } from "@/components/ui";
import { TEMPLATES } from "@/lib/campaign-schemas";
import { api, ApiError } from "@/lib/api";

export default function NewCampaignPage() {
  const router = useRouter();
  const [template, setTemplate] = useState<"treasure_hunt" | "creative_contest" | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-orange-ink">Step 1</p>
        <h1 className="text-2xl font-semibold">Choose an experience</h1>
      </div>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Template">
        {(Object.entries(TEMPLATES) as [keyof typeof TEMPLATES, (typeof TEMPLATES)[keyof typeof TEMPLATES]][]).map(([id, t]) =>
          t.live ? (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={template === id}
              onClick={() => setTemplate(id as "treasure_hunt")}
              className={`rounded-lg border p-5 text-left transition-colors ${template === id ? "border-orange-deep bg-orange-wash" : "border-line bg-card hover:border-line-strong"}`}
            >
              <p className="font-display text-lg font-semibold">{t.label}</p>
              <p className="mt-1 text-sm text-ink-2">{t.blurb}</p>
            </button>
          ) : (
            <div key={id} aria-disabled className="rounded-lg border border-dashed border-line-strong bg-paper p-5 text-left opacity-75">
              <div className="flex items-center gap-2">
                <p className="font-display text-lg font-semibold text-ink-2">{t.label}</p>
                <Badge>Coming soon</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-3">{t.blurb}</p>
            </div>
          ),
        )}
      </div>
      {template && (
        <Card className="p-5">
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                const r = await api<{ id: string }>("/api/organizer/campaigns", { method: "POST", body: { template, title } });
                router.push(`/organizer/campaigns/${r.id}`);
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Could not create the campaign.");
                setBusy(false);
              }
            }}
          >
            <Field label="Campaign name" htmlFor="title" hint="You can change it later.">
              <input id="title" required minLength={3} maxLength={80} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={template === "treasure_hunt" ? "The Hidden Signal" : "Help us imagine our next product"} />
            </Field>
            {error && <Notice tone="danger">{error}</Notice>}
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create draft"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
