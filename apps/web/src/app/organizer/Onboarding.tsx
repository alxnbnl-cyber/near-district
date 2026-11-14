"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SPACE_CATEGORIES } from "@near-district/core/world";
import { Field, Notice, inputClass } from "@/components/ui";
import { WalletChooser } from "@/components/auth/WalletChooser";
import { GameIcon } from "@/components/host/GameIcon";
import { frame } from "@/components/explore/frame";
import { slugify, spaceInput } from "@/lib/schemas";
import { api, ApiError } from "@/lib/api";

const CATEGORY_LABELS: Record<string, string> = {
  project: "Project / product", defi: "DeFi", infrastructure: "Infrastructure", tooling: "Developer tools", other: "Something else",
  puzzle: "Puzzles", gaming: "Gaming", creative: "Creative studio", art: "Art", media: "Media",
  community: "Community", dao: "DAO", education: "Education", social: "Social",
};

const INK = "rgb(214 219 225";
const PANEL = "bg-[rgb(10_13_18/.7)] p-6 backdrop-blur";

/** Two short steps: prove your wallet, then the company profile. Everything else unlocks after review. */
export function Onboarding({ hasWallet, walletAccount }: { hasWallet: boolean; walletAccount: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", slug: "", category: "project", tagline: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!logo) return setLogoUrl(null);
    const u = URL.createObjectURL(logo);
    setLogoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [logo]);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v, ...(k === "name" && !slugTouched ? { slug: slugify(v) } : {}) }));

  return (
    <div className="flex flex-col gap-7">
      <section className="yv-enter flex items-center gap-5 font-mono">
        <GameIcon name="host" size={96} className="hidden sm:block" />
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-orange">Host a mission</p>
          <h1 className="mt-1 font-display text-[34px] font-bold uppercase leading-tight tracking-[0.02em] text-white">Put your company on the map</h1>
          <p className="mt-1 font-sans text-[16px] text-[rgb(214_219_225/.7)]">Two quick steps. Funding and missions unlock after a short review.</p>
        </div>
      </section>

      <ol className="flex flex-wrap gap-2 font-mono">
        {["Connect wallet", "Company profile"].map((label, i) => {
          const done = i === 0 && hasWallet;
          const now = (i === 0 && !hasWallet) || (i === 1 && hasWallet);
          return (
            <li
              key={label}
              className={`flex h-10 items-center gap-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.18em] ${now ? "bg-[rgb(255_145_56/.12)] text-orange" : done ? "text-[rgb(214_219_225/.8)]" : "text-[rgb(214_219_225/.4)]"}`}
              style={frame(9, now ? "rgb(255 145 56 / .6)" : `${INK} / .14)`)}
            >
              <span className={`grid size-5 place-items-center text-[10px] font-black ${done ? "bg-orange text-[#140c05]" : "border border-current"}`}>{done ? "✓" : i + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>

      {!hasWallet ? (
        <div className={`max-w-xl ${PANEL}`} style={frame(14, `${INK} / .14)`)}>
          <h2 className="font-display text-[20px] font-bold uppercase tracking-[0.04em] text-white">Connect your NEAR wallet</h2>
          <p className="mt-1 text-[14px] text-[rgb(214_219_225/.7)]">You&apos;ll fund rewards from it, so sign once to prove it&apos;s yours.</p>
          <div className="mt-5">
            <WalletChooser purpose="link_wallet" returnTo="/organizer" onDone={() => router.refresh()} />
          </div>
        </div>
      ) : (
        <form
          className="grid gap-5 lg:grid-cols-[1fr_260px]"
          onSubmit={async (e) => {
            e.preventDefault();
            setServerError(null);
            const parsed = spaceInput.safeParse({ organizationName: form.name, name: form.name, slug: form.slug, category: form.category, tagline: form.tagline, description: "", socials: {} });
            if (!parsed.success) {
              setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
              return;
            }
            setErrors({});
            setBusy(true);
            try {
              await api("/api/organizer/space", { method: "POST", body: parsed.data });
              if (logo) {
                // the company exists now, so the logo can be stored against it
                const fd = new FormData();
                fd.set("purpose", "logo");
                fd.set("file", logo);
                const res = await fetch("/api/uploads", { method: "POST", body: fd });
                const up = (await res.json().catch(() => null)) as { id?: string } | null;
                if (res.ok && up?.id) await api("/api/organizer/space", { method: "PATCH", body: { logoUploadId: up.id } });
              }
              router.refresh();
            } catch (err) {
              setServerError(err instanceof ApiError ? err.message : "Could not create your profile.");
              setBusy(false);
            }
          }}
        >
          <div className={`flex flex-col gap-4 ${PANEL}`} style={frame(14, `${INK} / .14)`)}>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-mint-ink">✓ Wallet {walletAccount}</p>
            <Field label="Company name" htmlFor="name" error={errors.name ?? errors.organizationName}>
              <input id="name" className={`${inputClass} h-12 text-[16px]`} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Lantern Labs" />
            </Field>
            <Field label="Link" htmlFor="slug" error={errors.slug} hint={`neardistrict.app/explore?space=${form.slug || "your-company"}`}>
              <input
                id="slug"
                className={inputClass}
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", e.target.value);
                }}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="category">
                <select id="category" className={inputClass} value={form.category} onChange={(e) => set("category", e.target.value)}>
                  {SPACE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c] ?? c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="One-line pitch" htmlFor="tagline" error={errors.tagline}>
                <input id="tagline" className={inputClass} maxLength={120} value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Puzzles hidden in our docs" />
              </Field>
            </div>
            <Field label="Logo" htmlFor="logo" hint="Square PNG, JPEG or WebP, under 1 MB. Shown on your map pin.">
              <div className="flex items-center gap-3">
                <label
                  htmlFor="logo"
                  className="inline-flex h-11 cursor-pointer items-center gap-2 px-4 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[rgb(214_219_225/.85)] hover:text-white"
                  style={frame(9, `${INK} / .25)`)}
                >
                  {logo ? "Change logo" : "Upload logo"}
                </label>
                <input
                  id="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && file.size > 1_000_000) {
                      setErrors((x) => ({ ...x, logo: "Logo must be under 1 MB." }));
                      return;
                    }
                    setErrors(({ logo: _drop, ...rest }) => rest);
                    setLogo(file);
                  }}
                />
                {logo && <span className="truncate font-mono text-[11px] text-[rgb(214_219_225/.55)]">{logo.name}</span>}
                {logo && (
                  <button type="button" onClick={() => setLogo(null)} className="font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-[rgb(214_219_225/.5)] hover:text-white">
                    Remove
                  </button>
                )}
              </div>
              {errors.logo && <p className="mt-1 text-[12px] text-danger">{errors.logo}</p>}
            </Field>
            {serverError && <Notice tone="danger">{serverError}</Notice>}
            <div>
              <button
                type="submit"
                disabled={busy || form.name.trim().length < 2}
                className="h-12 bg-orange px-7 font-mono text-[12.5px] font-black uppercase tracking-[0.16em] text-[#140c05] transition-colors hover:bg-[#ffa458] disabled:opacity-40"
                style={frame(11, "rgb(255 145 56)")}
              >
                {busy ? "Submitting…" : "Submit for review"}
              </button>
            </div>
          </div>

          <div className={PANEL} style={frame(14, `${INK} / .14)`)}>
            <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.5)]">Preview on the map</p>
            <div className="mt-4 grid place-items-center bg-[#0b0f15] py-8 shadow-[inset_0_0_0_1px_rgb(255_255_255/.06)]">
              <span className="yv-float relative block size-16 drop-shadow-[0_0_10px_rgb(255_145_56/.5)]">
                <span className="absolute inset-0 bg-orange" style={{ clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)" }} />
                <span
                  className="absolute inset-[2.5px] grid place-items-center overflow-hidden bg-[linear-gradient(180deg,#141922,#07090c)] font-display text-[20px] font-bold text-orange"
                  style={{ clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)" }}
                >
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="size-full object-cover" />
                  ) : (
                    (form.name.match(/[A-Za-z0-9]/)?.[0] ?? "Y").toUpperCase()
                  )}
                </span>
              </span>
              <span className="mt-3 max-w-full truncate px-3 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white">{form.name || "Your company"}</span>
              {form.tagline && <span className="mt-1 max-w-full truncate px-3 text-[12px] text-[rgb(214_219_225/.55)]">{form.tagline}</span>}
            </div>
            <p className="mt-3 text-[12.5px] text-[rgb(214_219_225/.55)]">Reviewed before it appears to players.</p>
          </div>
        </form>
      )}

      <Link href="/organizer/how-it-works" className="self-start font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.55)] hover:text-white">
        How it works →
      </Link>
    </div>
  );
}
