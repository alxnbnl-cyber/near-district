"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DISTRICTS, districtForCategory, SPACE_CATEGORIES } from "@yielvy/core/world";
import { Button, Card, Field, Notice, inputClass, textareaClass } from "@/components/ui";
import { WalletChooser } from "@/components/auth/WalletChooser";
import { useBuildingPreviews } from "@/components/world/BuildingPreviews";
import { BUILDING_STYLE_IDS, slugify, spaceInput } from "@/lib/schemas";
import { api, ApiError } from "@/lib/api";

const STYLE_LABELS: Record<string, string> = {
  workshop: "Workshop",
  tower: "Tower",
  market: "Market hall",
  atelier: "Atelier",
  observatory: "Observatory",
  pavilion: "Pavilion",
};

const CATEGORY_LABELS: Record<string, string> = {
  project: "Project / product",
  defi: "DeFi",
  infrastructure: "Infrastructure",
  tooling: "Developer tooling",
  other: "Something else",
  puzzle: "Puzzles & mysteries",
  gaming: "Gaming",
  creative: "Creative studio",
  art: "Art",
  media: "Media",
  community: "Community",
  dao: "DAO",
  education: "Education",
  social: "Social",
};

export function Onboarding({ hasWallet, walletAccount }: { hasWallet: boolean; walletAccount: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState({
    organizationName: "",
    name: "",
    slug: "",
    category: "project",
    tagline: "",
    description: "",
    websiteUrl: "",
    buildingStyle: "workshop" as (typeof BUILDING_STYLE_IDS)[number],
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const district = districtForCategory(form.category);
  const previews = useBuildingPreviews(district.theme as "orange");
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v, ...(k === "name" && !slugTouched ? { slug: slugify(v) } : {}) }));

  const districtLine = useMemo(() => DISTRICTS.find((d) => d.id === district.id)!, [district.id]);

  if (!hasWallet) {
    return (
      <Card className="max-w-xl p-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-orange-ink">Step 1 of 2</p>
        <h1 className="mt-1 text-2xl font-semibold">Verify a NEAR wallet</h1>
        <p className="mt-2 text-sm text-ink-2">
          Organizers fund rewards and authorize payouts, so we need cryptographic proof that you control a NEAR account. Typing an account name is not enough.
        </p>
        <div className="mt-5">
          <WalletChooser purpose="link_wallet" returnTo="/organizer" onDone={() => router.refresh()} />
        </div>
      </Card>
    );
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setServerError(null);
        const parsed = spaceInput.safeParse({ ...form, socials: {} });
        if (!parsed.success) {
          setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
          return;
        }
        setErrors({});
        setBusy(true);
        try {
          await api("/api/organizer/space", { method: "POST", body: parsed.data });
          router.refresh();
        } catch (err) {
          setServerError(err instanceof ApiError ? err.message : "Could not create the Space.");
          setBusy(false);
        }
      }}
    >
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-orange-ink">Step 2 of 2 · wallet {walletAccount} verified</p>
        <h1 className="mt-1 text-2xl font-semibold">Open your Space</h1>
        <p className="mt-1 text-sm text-ink-2">One organization gets one building. You'll run all your campaigns from inside it.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card className="flex flex-col gap-4 p-5">
          <Field label="Organization name" htmlFor="org" error={errors.organizationName} hint="The legal or public name of your team.">
            <input id="org" className={inputClass} value={form.organizationName} onChange={(e) => set("organizationName", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Space name" htmlFor="name" error={errors.name}>
              <input id="name" className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Web address" htmlFor="slug" error={errors.slug} hint={`yielvy.app/s/${form.slug || "your-space"}`}>
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
          </div>
          <Field label="What best describes you?" htmlFor="category" hint={`Your building goes in ${districtLine.name} — ${districtLine.tagline.toLowerCase()}.`}>
            <select id="category" className={inputClass} value={form.category} onChange={(e) => set("category", e.target.value)}>
              {SPACE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c] ?? c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tagline" htmlFor="tagline" error={errors.tagline} hint="One line explorers see when they hover your building.">
            <input id="tagline" className={inputClass} maxLength={120} value={form.tagline} onChange={(e) => set("tagline", e.target.value)} />
          </Field>
          <Field label="About" htmlFor="description" error={errors.description}>
            <textarea id="description" className={textareaClass} maxLength={2000} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label="Website" htmlFor="website" error={errors.websiteUrl}>
            <input id="website" type="url" placeholder="https://" className={inputClass} value={form.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} />
          </Field>
        </Card>

        <Card className="p-5">
          <fieldset>
            <legend className="text-[13px] font-semibold">Building</legend>
            <p className="mt-0.5 text-[12.5px] text-ink-3">Colours follow your district. Custom art can replace these later.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {BUILDING_STYLE_IDS.map((s) => (
                <label
                  key={s}
                  className={`cursor-pointer rounded-md border p-2 text-center text-[12.5px] font-semibold ${
                    form.buildingStyle === s ? "border-orange-deep bg-orange-wash" : "border-line hover:border-line-strong"
                  }`}
                >
                  <input type="radio" name="style" value={s} className="sr-only" checked={form.buildingStyle === s} onChange={() => set("buildingStyle", s)} />
                  <span className="block aspect-square">
                    {previews?.[s] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previews[s]} alt="" className="size-full object-contain" />
                    ) : (
                      <span className="block size-full rounded bg-paper-2" />
                    )}
                  </span>
                  {STYLE_LABELS[s]}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
      </div>

      {serverError && <Notice tone="danger">{serverError}</Notice>}
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Opening…" : "Open my Space"}
        </Button>
        <p className="text-[12.5px] text-ink-3">New Spaces are reviewed before they appear to explorers.</p>
      </div>
    </form>
  );
}
