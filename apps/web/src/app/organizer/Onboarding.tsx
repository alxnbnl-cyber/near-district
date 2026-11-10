"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SPACE_CATEGORIES } from "@yielvy/core/world";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { WalletChooser } from "@/components/auth/WalletChooser";
import { VaultDoor } from "@/components/art/Art";
import { slugify, spaceInput } from "@/lib/schemas";
import { api, ApiError } from "@/lib/api";
import { HowItWorks } from "./HowItWorks";

const CATEGORY_LABELS: Record<string, string> = {
  project: "Project / product", defi: "DeFi", infrastructure: "Infrastructure", tooling: "Developer tools", other: "Something else",
  puzzle: "Puzzles", gaming: "Gaming", creative: "Creative studio", art: "Art", media: "Media",
  community: "Community", dao: "DAO", education: "Education", social: "Social",
};

/** Two short steps: prove your wallet, name your vault. Everything else can wait. */
export function Onboarding({ hasWallet, walletAccount }: { hasWallet: boolean; walletAccount: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", slug: "", category: "project", tagline: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v, ...(k === "name" && !slugTouched ? { slug: slugify(v) } : {}) }));

  return (
    <div className="flex flex-col gap-8">
      <section className="grid items-center gap-6 md:grid-cols-[1fr_220px]">
        <div className="yv-enter">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-orange-ink">Step {hasWallet ? 2 : 1} of 2</p>
          <h1 className="mt-1 text-[34px] font-bold leading-tight tracking-[-0.02em]">Open your vault on the map</h1>
          <p className="mt-2 max-w-lg text-[16px] text-ink-2">Your vault is where explorers find your quests and win your prizes.</p>
        </div>
        <VaultDoor size={200} className="yv-float hidden md:block" />
      </section>

      {!hasWallet ? (
        <div className="max-w-xl rounded-[18px] border border-line bg-card p-6">
          <h2 className="text-xl font-semibold">Connect your NEAR wallet</h2>
          <p className="mt-1 text-[14px] text-ink-2">You&apos;ll fund prizes from it, so we ask you to sign once to prove it&apos;s yours.</p>
          <div className="mt-5">
            <WalletChooser purpose="link_wallet" returnTo="/organizer" onDone={() => router.refresh()} />
          </div>
        </div>
      ) : (
        <form
          className="grid gap-6 lg:grid-cols-[1fr_280px]"
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
              router.refresh();
            } catch (err) {
              setServerError(err instanceof ApiError ? err.message : "Could not open the vault.");
              setBusy(false);
            }
          }}
        >
          <div className="flex flex-col gap-4 rounded-[18px] border border-line bg-card p-6">
            <p className="text-[12.5px] text-mint-ink">✓ Wallet {walletAccount} connected</p>
            <Field label="Vault name" htmlFor="name" error={errors.name ?? errors.organizationName}>
              <input id="name" className={`${inputClass} h-12 text-[16px]`} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Lantern Labs" />
            </Field>
            <Field label="Link" htmlFor="slug" error={errors.slug} hint={`yielvy.app/s/${form.slug || "your-vault"}`}>
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
            {serverError && <Notice tone="danger">{serverError}</Notice>}
            <div>
              <Button type="submit" size="lg" className="yv-glow" disabled={busy || form.name.trim().length < 2}>
                {busy ? "Opening…" : "Open my vault"}
              </Button>
            </div>
          </div>

          <div className="rounded-[18px] border border-line bg-card p-5">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-3">Preview on the map</p>
            <div className="mt-4 grid place-items-center rounded-[14px] bg-[#0e1520] py-8">
              <svg width="54" height="68" viewBox="0 0 40 50" className="yv-float drop-shadow-[0_8px_14px_rgb(0_0_0/.75)]" aria-hidden>
                <path d="M20 49C20 49 3 30.5 3 18.5a17 17 0 0 1 34 0C37 30.5 20 49 20 49Z" fill="#FF9138" stroke="#0b0f15" strokeWidth="2" />
                <circle cx="20" cy="18.5" r="11.5" fill="#0b0f15" />
                <text x="20" y="23" textAnchor="middle" fontSize="13" fontWeight="700" fill="#FF9138">{(form.name.match(/[A-Za-z0-9]/)?.[0] ?? "Y").toUpperCase()}</text>
              </svg>
              <span className="mt-3 rounded-[10px] border border-white/10 bg-[#0b0f15f0] px-3 py-1.5 text-[13px] font-semibold">{form.name || "Your vault"}</span>
              {form.tagline && <span className="mt-1 text-[12px] text-ink-3">{form.tagline}</span>}
            </div>
            <p className="mt-3 text-[12px] text-ink-3">New vaults are reviewed before they appear to explorers. You can build quests meanwhile.</p>
          </div>
        </form>
      )}

      <HowItWorks open />
    </div>
  );
}
