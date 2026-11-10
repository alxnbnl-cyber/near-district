"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice, inputClass } from "@/components/ui";
import { Lightbulb, TreasureMap } from "@/components/art/Art";
import { api, ApiError } from "@/lib/api";

const TYPES = [
  { id: "treasure_hunt" as const, art: TreasureMap, title: "Treasure Hunt", body: "A trail of clues about your project. Solve them all to win.", ph: "The Hidden Signal" },
  { id: "creative_contest" as const, art: Lightbulb, title: "Creative Challenge", body: "Ask for ideas or work. Your team picks the winners.", ph: "Design our next feature" },
];

export default function NewQuestPage() {
  const router = useRouter();
  const [template, setTemplate] = useState<(typeof TYPES)[number]["id"] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = TYPES.find((t) => t.id === template);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="yv-enter">
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-orange-ink">New quest</p>
        <h1 className="mt-1 text-[32px] font-bold tracking-[-0.02em]">What kind of quest?</h1>
      </div>
      <div className="yv-stagger grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label="Quest type">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={template === t.id}
            onClick={() => setTemplate(t.id)}
            className={`flex flex-col items-center rounded-[22px] border p-6 text-center transition-all hover:-translate-y-1 ${template === t.id ? "card-reward yv-glow" : "border-line bg-card hover:border-line-strong"}`}
          >
            <t.art size={130} className={template === t.id ? "yv-float" : ""} />
            <p className="mt-2 font-display text-[20px] font-bold">{t.title}</p>
            <p className="mt-1 text-[14px] text-ink-2">{t.body}</p>
          </button>
        ))}
      </div>
      <p className="text-[12.5px] text-ink-3">More quest types are coming soon.</p>

      {chosen && (
        <form
          className="yv-pop flex flex-col gap-3 rounded-[18px] border border-line bg-card p-5 sm:flex-row sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const r = await api<{ id: string }>("/api/organizer/campaigns", { method: "POST", body: { template, title } });
              router.push(`/organizer/campaigns/${r.id}`);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Could not create the quest.");
              setBusy(false);
            }
          }}
        >
          <label className="flex-1">
            <span className="text-[13px] font-semibold">Give it a name</span>
            <input autoFocus required minLength={3} maxLength={80} className={`${inputClass} mt-1.5 h-12 text-[16px]`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={chosen.ph} />
          </label>
          <Button type="submit" size="lg" className="h-12" disabled={busy || title.trim().length < 3}>
            {busy ? "Creating…" : "Let's build it →"}
          </Button>
          {error && <Notice tone="danger">{error}</Notice>}
        </form>
      )}
    </div>
  );
}
