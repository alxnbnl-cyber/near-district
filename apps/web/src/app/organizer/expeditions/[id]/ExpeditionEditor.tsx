"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Field, Notice, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Detail {
  expedition: { id: string; title: string; slug: string; summary: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; primaryOrgId: string; rewardCampaignId: string | null; definitionHash: string | null };
  primaryName: string;
  chapters: { ch: { campaignId: string; organizationId: string; position: number }; title: string; slug: string; template: string; spaceSlug: string; spaceName: string }[];
  partners: { p: { organizationId: string; status: string }; name: string; slug: string }[];
  problems: string[];
  myOrgId: string;
}
interface Camp {
  id: string;
  title: string;
  template: string;
  status: string;
}

export function ExpeditionEditor({ id, canManage }: { id: string; canManage: boolean }) {
  const [d, setD] = useState<Detail | null>(null);
  const [mine, setMine] = useState<Camp[]>([]);
  const [pick, setPick] = useState("");
  const [partnerSlug, setPartnerSlug] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [detail, offers] = await Promise.all([api<Detail>(`/api/organizer/expeditions/${id}`), api<{ options: { ownCampaigns: Camp[] } }>("/api/organizer/offerings")]);
    setD(detail);
    setMine(offers.options.ownCampaigns.filter((c) => c.status !== "DRAFT" && c.status !== "PENDING_FUNDING"));
  }, [id]);
  useEffect(() => {
    void load().catch((e) => setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Could not load." }));
  }, [load]);

  const post = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/organizer/expeditions/${id}`, { method: "POST", body });
      setMsg({ tone: "ok", text: ok });
      setPick("");
      await load();
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  };

  if (!d) return <p className="text-sm text-ink-3">{msg?.text ?? "Loading…"}</p>;
  const e = d.expedition;
  const primary = e.primaryOrgId === d.myOrgId;
  const draft = e.status === "DRAFT";
  const myInvite = d.partners.find((p) => p.p.organizationId === d.myOrgId);
  const used = new Set(d.chapters.map((c) => c.ch.campaignId));
  const ids = d.chapters.map((c) => c.ch.campaignId);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j]!, next[i]!];
    void post({ action: "reorder", campaignIds: next }, "Order updated.");
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={draft ? "neutral" : "mint"}>{draft ? "Draft" : "Published"}</Badge>
        <span className="text-[13px] text-ink-3">Primary organizer: {d.primaryName}</span>
        {!draft && (
          <Link href={`/x/${e.slug}`} className="text-[13px] font-semibold text-orange-ink hover:underline">
            View public page ↗
          </Link>
        )}
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {myInvite && myInvite.p.status === "PENDING" && draft && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold">You&apos;re invited to contribute a chapter</h2>
          <p className="mt-1 text-[13.5px] text-ink-2">Pick one of your published campaigns. It stays yours and keeps working on its own.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select className={inputClass} value={pick} onChange={(ev) => setPick(ev.target.value)} disabled={!canManage}>
              <option value="">Choose a campaign…</option>
              {mine.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
            <Button disabled={!canManage || busy || !pick} onClick={() => post({ action: "respond", decision: "accept", campaignId: pick }, "You joined the expedition.")}>Accept & contribute</Button>
            <Button variant="secondary" disabled={!canManage || busy} onClick={() => post({ action: "respond", decision: "reject" }, "Invitation declined.")}>Decline</Button>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="text-lg font-semibold">Route</h2>
        <ol className="mt-3 flex flex-col gap-2">
          {d.chapters.map((c, i) => (
            <li key={c.ch.campaignId} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-paper px-4 py-3">
              <span className="grid size-8 place-items-center rounded-full bg-orange-wash font-display text-sm font-bold text-orange-ink">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {c.title} {e.rewardCampaignId === c.ch.campaignId && <Badge tone="gold">Reward chapter</Badge>}
                </p>
                <p className="text-[12.5px] text-ink-3">{c.spaceName} · {c.template === "treasure_hunt" ? "Treasure Hunt" : "Creative Contest"}</p>
              </div>
              {draft && canManage && (
                <div className="flex gap-1">
                  {primary && (
                    <>
                      <Button size="sm" variant="ghost" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</Button>
                      <Button size="sm" variant="ghost" aria-label="Move down" disabled={busy || i === ids.length - 1} onClick={() => move(i, 1)}>↓</Button>
                    </>
                  )}
                  {(primary || c.ch.organizationId === d.myOrgId) && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => post({ action: "remove_chapter", campaignId: c.ch.campaignId }, "Chapter removed.")}>Remove</Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
        {d.chapters.length === 0 && <p className="text-[13.5px] text-ink-3">No chapters yet.</p>}
        {primary && draft && canManage && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <select className={inputClass} value={pick} onChange={(ev) => setPick(ev.target.value)}>
              <option value="">Add one of your published campaigns…</option>
              {mine.filter((c) => !used.has(c.id)).map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
            <Button variant="secondary" disabled={busy || !pick} onClick={() => post({ action: "add_chapter", campaignId: pick }, "Chapter added.")}>Add chapter</Button>
          </div>
        )}
      </Card>

      {primary && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Partners</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {d.partners.map((p) => (
              <li key={p.p.organizationId} className="flex items-center gap-2 text-[14px]">
                {p.name} <Badge tone={p.p.status === "ACCEPTED" ? "mint" : p.p.status === "PENDING" ? "gold" : "neutral"}>{p.p.status}</Badge>
              </li>
            ))}
            {d.partners.length === 0 && <li className="text-[13.5px] text-ink-3">Invite another organization to contribute a chapter.</li>}
          </ul>
          {draft && canManage && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field label="Partner Space address" htmlFor="ex-partner">
                <input id="ex-partner" className={inputClass} value={partnerSlug} onChange={(ev) => setPartnerSlug(ev.target.value.trim().toLowerCase())} placeholder="their-space" />
              </Field>
              <Button variant="secondary" disabled={busy || partnerSlug.length < 3} onClick={() => post({ action: "invite", organizationSlug: partnerSlug }, "Invitation sent.").then(() => setPartnerSlug(""))}>Invite</Button>
            </div>
          )}
        </Card>
      )}

      {primary && draft && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Reward chapter (optional)</h2>
          <p className="mt-1 text-[13.5px] text-ink-2">
            Make your own final chapter the prize chapter: only players who completed every earlier chapter can join it. Its rewards are funded and paid by
            your campaign&apos;s existing vault funding and published reward rules — finishing other chapters never pays anything by itself.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              className={inputClass}
              value={e.rewardCampaignId ?? ""}
              disabled={!canManage || busy}
              onChange={(ev) => post({ action: "set_reward", campaignId: ev.target.value || null }, "Reward chapter updated.")}
            >
              <option value="">No reward chapter</option>
              {d.chapters.filter((c) => c.ch.organizationId === d.myOrgId).map((c) => (
                <option key={c.ch.campaignId} value={c.ch.campaignId}>{c.title}</option>
              ))}
            </select>
          </div>
        </Card>
      )}

      {primary && draft && (
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Review & publish</h2>
          {d.problems.length ? (
            <Notice tone="warn" title="Before you can publish">
              <ul className="mt-1 list-disc pl-5">{d.problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </Notice>
          ) : (
            <Notice tone="ok" title="Ready to publish">Every partner approved their chapter. Publishing freezes the route.</Notice>
          )}
          <Button className="mt-3" disabled={!canManage || busy || d.problems.length > 0} onClick={() => post({ action: "publish" }, "Expedition published — it now appears on the map.")}>
            Publish expedition
          </Button>
        </Card>
      )}
    </div>
  );
}
