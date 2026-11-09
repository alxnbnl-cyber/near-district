"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActivityDef } from "@yielvy/core";
import { Badge, Button, Card, Field, Notice, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { ActivityConfig, type Options } from "../campaigns/[id]/HintsEditor";

interface Partnership {
  id: string;
  direction: "incoming" | "outgoing";
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "EXPIRED";
  message: string;
  expiresAt: string;
  createdAt: string;
  partner: { id: string; name: string; slug: string; spaceSlug: string | null } | null;
}
interface Offering {
  id: string;
  title: string;
  description: string;
  status: "active" | "withdrawn";
  label: string;
  activity: ActivityDef;
  usedIn: { hint: string; campaign: string; status: string }[];
}

const TONE = { PENDING: "gold", ACCEPTED: "mint", REJECTED: "danger", CANCELLED: "neutral", EXPIRED: "neutral" } as const;

export function PartnersPanel({ canManage }: { canManage: boolean }) {
  const [partners, setPartners] = useState<Partnership[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  const [slug, setSlug] = useState("");
  const [message, setMessage] = useState("");
  const [offerType, setOfferType] = useState<string>("");
  const [offerTitle, setOfferTitle] = useState("");
  const [offerDesc, setOfferDesc] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, o] = await Promise.all([api<Partnership[]>("/api/organizer/partners"), api<{ offerings: Offering[]; options: Options }>("/api/organizer/offerings")]);
    setPartners(p);
    setOfferings(o.offerings);
    setOptions(o.options);
  }, []);
  useEffect(() => {
    void load().catch((e) => setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Could not load partners." }));
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
  const open = partners.filter((p) => p.status === "PENDING" || p.status === "ACCEPTED");
  const past = partners.filter((p) => p.status !== "PENDING" && p.status !== "ACCEPTED");

  return (
    <div className="flex flex-col gap-6">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!canManage && <Notice tone="info">Only owners and admins can manage partnerships and offerings.</Notice>}

      <Card className="p-5">
        <h2 className="text-lg font-semibold">Invite a partner</h2>
        <p className="mt-1 text-[13.5px] text-ink-2">Partners can offer activities (a learning quiz, a reviewed contribution, a RHEA activity) that unlock hints in your hunts, and you can offer yours to them.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
          <Field label="Their Space address" htmlFor="p-slug" hint="The part after /s/ in their Space link.">
            <input id="p-slug" className={inputClass} value={slug} onChange={(e) => setSlug(e.target.value.trim().toLowerCase())} placeholder="their-space" disabled={!canManage} />
          </Field>
          <Field label="Message (optional)" htmlFor="p-msg">
            <input id="p-msg" className={inputClass} value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} disabled={!canManage} />
          </Field>
          <Button disabled={!canManage || busy || slug.length < 3} onClick={() => run(() => api("/api/organizer/partners", { method: "POST", body: { organizationSlug: slug, message } }), "Invitation sent.").then(() => setSlug(""))}>
            Send invite
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">Partners</h2>
        {open.length === 0 && <p className="mt-2 text-[13.5px] text-ink-3">No partners yet.</p>}
        <ul className="mt-3 flex flex-col gap-2">
          {open.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-paper px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {p.partner?.name ?? "Unknown"} <Badge tone={TONE[p.status]}>{p.status === "PENDING" ? (p.direction === "incoming" ? "Invited you" : "Awaiting reply") : "Partner"}</Badge>
                </p>
                {p.message && <p className="mt-0.5 text-[13px] text-ink-3">“{p.message}”</p>}
                {p.status === "PENDING" && <p className="text-[12px] text-ink-3">Expires {new Date(p.expiresAt).toLocaleDateString()}</p>}
              </div>
              {canManage && (
                <div className="flex gap-2">
                  {p.status === "PENDING" && p.direction === "incoming" && (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => act(p.id, "accept", "Partnership accepted.")}>Accept</Button>
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(p.id, "reject", "Invitation declined.")}>Decline</Button>
                    </>
                  )}
                  {p.status === "PENDING" && p.direction === "outgoing" && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(p.id, "cancel", "Invitation cancelled.")}>Cancel invite</Button>
                  )}
                  {p.status === "ACCEPTED" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => confirm("End this partnership? Hints that use their activities will follow each hint's published withdrawal policy.") && act(p.id, "cancel", "Partnership ended.")}
                    >
                      End partnership
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {past.length > 0 && (
          <details className="mt-3 text-[13px]">
            <summary className="cursor-pointer text-ink-3">History ({past.length})</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {past.map((p) => (
                <li key={p.id} className="text-ink-3">
                  {p.partner?.name} · {p.direction} · <Badge tone={TONE[p.status]}>{p.status}</Badge>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">Activities you offer partners</h2>
        <p className="mt-1 text-[13.5px] text-ink-2">Offerings are visible to every accepted partner. You stay the owner: you verify or review completions, and you can withdraw any time.</p>
        <ul className="mt-3 flex flex-col gap-2">
          {offerings.map((o) => (
            <li key={o.id} className="rounded-md border border-line bg-paper px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {o.title} {o.status === "withdrawn" && <Badge>Withdrawn</Badge>}
                  </p>
                  <p className="text-[13px] text-ink-3">{o.label}</p>
                  {o.usedIn.length > 0 && (
                    <p className="mt-1 text-[12.5px] text-ink-2">Used in: {o.usedIn.map((u) => `“${u.hint}” (${u.campaign}, ${u.status.toLowerCase()})`).join(", ")}</p>
                  )}
                </div>
                {canManage && o.status === "active" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => confirm("Withdraw this offering? Partner hints using it follow their withdrawal policy.") && run(() => api(`/api/organizer/offerings/${o.id}`, { method: "DELETE" }), "Offering withdrawn.")}>
                    Withdraw
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {canManage && options && (
          <div className="mt-4 rounded-md border border-dashed border-line-strong p-4">
            <p className="font-medium">Offer a new activity</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Title" htmlFor="o-title">
                <input id="o-title" className={inputClass} value={offerTitle} maxLength={80} onChange={(e) => setOfferTitle(e.target.value)} placeholder="Complete the RHEA Learning Challenge" />
              </Field>
              <Field label="Description" htmlFor="o-desc">
                <input id="o-desc" className={inputClass} value={offerDesc} maxLength={500} onChange={(e) => setOfferDesc(e.target.value)} />
              </Field>
            </div>
            <Field label="Activity" htmlFor="o-type">
              <select id="o-type" className={`${inputClass} mt-1`} value={offerType} onChange={(e) => setOfferType(e.target.value)}>
                <option value="">Choose…</option>
                {options.catalogue.map((c) => (
                  <option key={c.type} value={c.type} disabled={!c.available}>
                    {c.label}
                    {!c.available ? " (unavailable)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            {offerType && (
              <ActivityConfig
                key={offerType}
                type={offerType}
                options={options}
                onPick={(activity) => run(() => api("/api/organizer/offerings", { method: "POST", body: { title: offerTitle, description: offerDesc, activity } }), "Offering published to your partners.").then(() => { setOfferType(""); setOfferTitle(""); setOfferDesc(""); })}
              />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
