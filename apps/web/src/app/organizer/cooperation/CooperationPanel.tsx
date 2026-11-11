"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, Notice, inputClass } from "@/components/ui";
import { GameIcon } from "@/components/host/GameIcon";
import { api, ApiError } from "@/lib/api";

interface Partner {
  id: string;
  direction: "incoming" | "outgoing";
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "EXPIRED";
  message: string;
  partner: { id: string; name: string; slug: string; spaceSlug: string | null } | null;
}
interface Trail {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  invitation?: string;
}

/** Cooperation = partners + joint trails, on one page. */
export function CooperationPanel({ canManage, embedded = false }: { canManage: boolean; embedded?: boolean }) {
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [trails, setTrails] = useState<{ own: Trail[]; invited: Trail[] }>({ own: [], invited: [] });
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, t] = await Promise.all([api<Partner[]>("/api/organizer/partners"), api<{ own: Trail[]; invited: Trail[] }>("/api/organizer/expeditions")]);
    setPartners(p);
    setTrails(t);
  }, []);
  useEffect(() => {
    void load().catch((e) => setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Could not load." }));
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "ok", text: ok });
      await load();
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  };
  const act = (id: string, action: "accept" | "reject" | "cancel", ok: string) => run(() => api(`/api/organizer/partners/${id}`, { method: "POST", body: { action } }), ok);
  const active = partners.filter((p) => p.status === "PENDING" || p.status === "ACCEPTED");
  const pendingTrailInvites = trails.invited.filter((t) => t.invitation === "PENDING");

  return (
    <div className="flex flex-col gap-6">
      <section className={embedded ? "hidden" : "flex items-center gap-5"}>
        <GameIcon name="play" size={120} className="hidden shrink-0 sm:block" />
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-orange-ink">Cooperation</p>
          <h1 className="mt-1 text-[30px] font-bold tracking-[-0.02em]">Team up with other projects</h1>
          <p className="mt-1 text-ink-2">Add partners, then build a joint trail: players hop between your missions to reach the prize.</p>
        </div>
      </section>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!canManage && <Notice tone="info">Only owners and admins can manage cooperation.</Notice>}

      {pendingTrailInvites.length > 0 && (
        <div className="card-reward rounded-[18px] p-4">
          <p className="font-semibold">You&apos;re invited to {pendingTrailInvites.length === 1 ? "a trail" : `${pendingTrailInvites.length} trails`}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {pendingTrailInvites.map((t) => (
              <Link key={t.id} href={`/organizer/expeditions/${t.id}`} className="rounded-full bg-orange px-3 py-1.5 text-[13px] font-semibold text-[#140c05]">
                {t.title} — answer →
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 1. partners */}
        <section className="rounded-[20px] border border-line bg-card p-5">
          <h2 className="flex items-center gap-2 text-[18px] font-bold">
            <span className="grid size-7 place-items-center rounded-full bg-orange-wash text-[13px] text-orange">1</span> Partners
          </h2>
          <div className="mt-3 flex gap-2">
            <input className={inputClass} value={slug} onChange={(e) => setSlug(e.target.value.trim().toLowerCase())} placeholder="Partner's project link, e.g. harbor-guild" disabled={!canManage} />
            <Button disabled={!canManage || busy || slug.length < 3} onClick={() => run(() => api("/api/organizer/partners", { method: "POST", body: { organizationSlug: slug, message: "" } }), "Invite sent.").then(() => setSlug(""))}>
              Invite
            </Button>
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {active.length === 0 && <li className="text-[13.5px] text-ink-3">No partners yet.</li>}
            {active.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-[12px] border border-line bg-paper px-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.partner?.name ?? "Unknown"}</span>
                  <span className={`text-[12px] ${p.status === "ACCEPTED" ? "text-mint-ink" : "text-gold-ink"}`}>
                    {p.status === "ACCEPTED" ? "Partner" : p.direction === "incoming" ? "Wants to team up" : "Invite sent"}
                  </span>
                </span>
                {canManage && (
                  <span className="flex gap-1">
                    {p.status === "PENDING" && p.direction === "incoming" && (
                      <>
                        <Button size="sm" disabled={busy} onClick={() => act(p.id, "accept", "You're partners now.")}>Accept</Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(p.id, "reject", "Declined.")}>Decline</Button>
                      </>
                    )}
                    {p.status === "PENDING" && p.direction === "outgoing" && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(p.id, "cancel", "Invite cancelled.")}>Cancel</Button>
                    )}
                    {p.status === "ACCEPTED" && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => confirm("End this partnership?") && act(p.id, "cancel", "Partnership ended.")}>End</Button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* 2. trails */}
        <section className="rounded-[20px] border border-line bg-card p-5">
          <h2 className="flex items-center gap-2 text-[18px] font-bold">
            <span className="grid size-7 place-items-center rounded-full bg-orange-wash text-[13px] text-orange">2</span> Joint trails
          </h2>
          <div className="mt-3 flex gap-2">
            <input className={inputClass} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Trail name, e.g. Harbor to Lighthouse" disabled={!canManage} />
            <Button
              disabled={!canManage || busy || title.trim().length < 3}
              onClick={async () => {
                try {
                  const r = await api<{ id: string }>("/api/organizer/expeditions", { method: "POST", body: { title, summary: "" } });
                  router.push(`/organizer/expeditions/${r.id}`);
                } catch (e) {
                  setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Could not create the trail." });
                }
              }}
            >
              Create
            </Button>
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {trails.own.length + trails.invited.length === 0 && <li className="text-[13.5px] text-ink-3">No trails yet.</li>}
            {[...trails.own.map((t) => ({ ...t, mine: true })), ...trails.invited.filter((t) => t.invitation !== "PENDING").map((t) => ({ ...t, mine: false }))].map((t) => (
              <li key={t.id}>
                <Link href={`/organizer/expeditions/${t.id}`} className="flex items-center justify-between rounded-[12px] border border-line bg-paper px-3 py-2.5 hover:border-line-strong">
                  <span>
                    <span className="block font-semibold">{t.title}</span>
                    <span className="text-[12px] text-ink-3">{t.mine ? "You lead" : "You're a stop"}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${t.status === "PUBLISHED" ? "bg-mint-wash text-mint-ink" : "bg-paper-2 text-ink-3"}`}>{t.status === "PUBLISHED" ? "Live" : "Draft"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
