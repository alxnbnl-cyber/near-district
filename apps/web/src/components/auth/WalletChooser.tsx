"use client";

import { useEffect, useState } from "react";
import { proveWallet, walletOptions, type WalletOption } from "@/lib/wallet";
import { Notice } from "@/components/ui";

export function WalletChooser({
  purpose,
  returnTo,
  onDone,
  intro,
}: {
  purpose: "near_login" | "link_wallet" | "step_up";
  returnTo: string;
  onDone: () => void;
  intro?: string;
}) {
  const [options, setOptions] = useState<WalletOption[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    walletOptions().then(setOptions, (e) => setError(String(e?.message ?? e)));
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {intro && <p className="text-sm text-ink-2">{intro}</p>}
      {!options && !error && <p className="text-sm text-ink-3">Loading wallets…</p>}
      <ul className="flex flex-col gap-2">
        {options?.map((w) => (
          <li key={w.id}>
            <button
              type="button"
              disabled={!w.available || busy !== null}
              onClick={async () => {
                setBusy(w.id);
                setError(null);
                try {
                  const r = await proveWallet(w.id, purpose, returnTo);
                  if (r === "done") onDone();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "The wallet did not complete the request.");
                } finally {
                  setBusy(null);
                }
              }}
              className="flex h-12 w-full items-center gap-3 rounded-md border border-line-strong bg-card px-3 text-left text-sm font-semibold hover:border-ink-3 disabled:opacity-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.iconUrl} alt="" width={24} height={24} className="size-6 rounded" />
              <span className="flex-1">{w.name}</span>
              <span className="text-[12px] font-medium text-ink-3">{busy === w.id ? "Waiting for wallet…" : w.available ? "" : "Not installed"}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <Notice tone="danger">{error}</Notice>}
      <p className="text-[12px] leading-relaxed text-ink-3">
        You'll be asked to sign a short message. Signing is free, sends no transaction and does not give Yielvy access to your funds.
      </p>
    </div>
  );
}
