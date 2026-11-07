"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, Notice, inputClass, textareaClass } from "@/components/ui";
import { BUILDING_STYLE_IDS } from "@/lib/schemas";
import { api, ApiError } from "@/lib/api";

interface Initial {
  name: string;
  tagline: string;
  description: string;
  websiteUrl: string;
  buildingStyle: string;
  socials: Record<string, string>;
  logoUploadId: string | null;
  bannerUploadId: string | null;
}

async function upload(purpose: "logo" | "banner", file: File): Promise<string> {
  const fd = new FormData();
  fd.set("purpose", purpose);
  fd.set("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Upload failed");
  return data.id as string;
}

export function SpaceSettingsForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="p-5">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg(null);
          try {
            await api("/api/organizer/space", {
              method: "PATCH",
              body: {
                name: f.name,
                tagline: f.tagline,
                description: f.description,
                websiteUrl: f.websiteUrl,
                buildingStyle: f.buildingStyle,
                socials: Object.fromEntries(Object.entries(f.socials).filter(([, v]) => v)),
                logoUploadId: f.logoUploadId,
                bannerUploadId: f.bannerUploadId,
              },
            });
            setMsg({ tone: "ok", text: f.name !== initial.name ? "Saved. Renaming sends your Space back for a quick review." : "Saved." });
            router.refresh();
          } catch (err) {
            setMsg({ tone: "danger", text: err instanceof ApiError ? err.message : "Could not save." });
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Logo" htmlFor="logo" hint="Square PNG/JPEG/WebP, under 1 MB.">
            <div className="flex items-center gap-3">
              {f.logoUploadId && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/uploads/${f.logoUploadId}`} alt="Current logo" className="size-14 rounded-lg border border-line object-cover" />
              )}
              <input id="logo" type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try { setF({ ...f, logoUploadId: await upload("logo", file) }); } catch (err) { setMsg({ tone: "danger", text: (err as Error).message }); }
              }} />
            </div>
          </Field>
          <Field label="Banner" htmlFor="banner" hint="Wide image, under 3 MB.">
            <input id="banner" type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try { setF({ ...f, bannerUploadId: await upload("banner", file) }); } catch (err) { setMsg({ tone: "danger", text: (err as Error).message }); }
            }} />
          </Field>
        </div>
        <Field label="Name" htmlFor="sname"><input id="sname" className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Tagline" htmlFor="stag"><input id="stag" className={inputClass} maxLength={120} value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></Field>
        <Field label="About" htmlFor="sdesc"><textarea id="sdesc" className={textareaClass} maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Website" htmlFor="sweb"><input id="sweb" type="url" className={inputClass} value={f.websiteUrl} onChange={(e) => setF({ ...f, websiteUrl: e.target.value })} /></Field>
          <Field label="Building" htmlFor="sstyle">
            <select id="sstyle" className={inputClass} value={f.buildingStyle} onChange={(e) => setF({ ...f, buildingStyle: e.target.value })}>
              {BUILDING_STYLE_IDS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          {(["x", "discord", "telegram", "github"] as const).map((k) => (
            <Field key={k} label={k[0]!.toUpperCase() + k.slice(1)} htmlFor={`soc-${k}`}>
              <input id={`soc-${k}`} type="url" placeholder="https://" className={inputClass} value={f.socials[k] ?? ""} onChange={(e) => setF({ ...f, socials: { ...f.socials, [k]: e.target.value } })} />
            </Field>
          ))}
        </div>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div><Button type="submit" disabled={busy}>Save Space</Button></div>
      </form>
    </Card>
  );
}
