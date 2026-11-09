"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Field, Notice, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Row {
  id: string;
  title: string;
  slug: string;
  summary: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  invitation?: string;
}

export function ExpeditionsPanel({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<{ own: Row[]; invited: Row[] } | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => setData(await api("/api/organizer/expeditions")), []);
  useEffect(() => {
    void load().catch((e) => setError(e instanceof ApiError ? e.message : "Could not load expeditions."));
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      {error && <Notice tone="danger">{error}</Notice>}
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Start a shared expedition</h2>
        <p className="mt-1 text-[13.5px] text-ink-2">
          Connect existing campaigns — yours and your partners&apos; — into one adventure. Players see the route on the map and unlock chapters in order. Each campaign keeps working on its own.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
          <Field label="Title" htmlFor="ex-title">
            <input id="ex-title" className={inputClass} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} disabled={!canManage} placeholder="The Grand Expedition" />
          </Field>
          <Field label="Summary" htmlFor="ex-sum">
            <input id="ex-sum" className={inputClass} value={summary} maxLength={300} onChange={(e) => setSummary(e.target.value)} disabled={!canManage} />
          </Field>
          <Button
            disabled={!canManage || title.trim().length < 3}
            onClick={async () => {
              try {
                const r = await api<{ id: string }>("/api/organizer/expeditions", { method: "POST", body: { title, summary } });
                router.push(`/organizer/expeditions/${r.id}`);
              } catch (e) {
                setError(e instanceof ApiError ? e.message : "Could not create the expedition.");
              }
            }}
          >
            Create
          </Button>
        </div>
      </Card>

      <section>
        <h2 className="text-lg font-semibold">Your expeditions</h2>
        {data?.own.length === 0 && <p className="mt-2 text-[13.5px] text-ink-3">None yet.</p>}
        <ul className="mt-3 flex flex-col gap-2">
          {data?.own.map((e) => (
            <li key={e.id}>
              <Link href={`/organizer/expeditions/${e.id}`} className="flex items-center justify-between rounded-md border border-line bg-card px-4 py-3 hover:border-line-strong">
                <span>
                  <span className="font-medium">{e.title}</span>
                  {e.summary && <span className="block text-[13px] text-ink-3">{e.summary}</span>}
                </span>
                <Badge tone={e.status === "PUBLISHED" ? "mint" : "neutral"}>{e.status === "PUBLISHED" ? "Published" : "Draft"}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Invitations from other organizers</h2>
        {data?.invited.length === 0 && <p className="mt-2 text-[13.5px] text-ink-3">No invitations.</p>}
        <ul className="mt-3 flex flex-col gap-2">
          {data?.invited.map((e) => (
            <li key={e.id}>
              <Link href={`/organizer/expeditions/${e.id}`} className="flex items-center justify-between rounded-md border border-line bg-card px-4 py-3 hover:border-line-strong">
                <span className="font-medium">{e.title}</span>
                <Badge tone={e.invitation === "PENDING" ? "gold" : e.invitation === "ACCEPTED" ? "mint" : "neutral"}>{e.invitation === "PENDING" ? "Needs your answer" : e.invitation}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
