"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "@near-district/core";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { sendTransactions, walletOptions, type WalletOption, type FnCall } from "@/lib/wallet";
import { WalletChooser } from "@/components/auth/WalletChooser";

type Plan = { signerId: string; transactions: FnCall[]; orderId?: string };

export function FundingActions({ campaignId, registered, vaultDeployed, token }: { campaignId: string; registered: boolean; vaultDeployed: boolean; token: { symbol: string; decimals: number }; defaultKind?: string }) {
  const router = useRouter();
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [walletId, setWalletId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [stepUp, setStepUp] = useState(false);

  useEffect(() => {
    if (vaultDeployed) walletOptions().then((w) => { setWallets(w); setWalletId(w.find((x) => x.available)?.id ?? ""); }).catch(() => {});
  }, [vaultDeployed]);

  const run = async (planBody: object, confirm: (hash: string, plan: Plan) => object) => {
    setBusy(true);
    setMsg(null);
    try {
      const plan = await api<Plan>("/api/organizer/funding", { method: "POST", body: planBody });
      const hashes = await sendTransactions(walletId, plan.signerId, plan.transactions);
      const h = hashes[hashes.length - 1];
      if (!h) {
        setMsg({ tone: "warn", text: "Sent, but your wallet didn't return a transaction hash. It will appear once the chain confirms it." });
        return;
      }
      const r = await api<{ state?: string }>("/api/organizer/funding", { method: "POST", body: confirm(h, plan) });
      setMsg({ tone: r.state === "FAILED" ? "danger" : "ok", text: r.state === "FAILED" ? "The prize vault did not accept that deposit, so the token contract returned your tokens." : "Confirmed on-chain." });
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "step_up_required") setStepUp(true);
      setMsg({ tone: "danger", text: e instanceof Error ? e.message : "Failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-4">
      {stepUp && (
        <div className="max-w-sm rounded-md border border-line p-4">
          <p className="mb-2 text-sm font-semibold">Confirm it's you</p>
          <WalletChooser purpose="step_up" returnTo="/organizer/funding" onDone={() => { setStepUp(false); setMsg({ tone: "info", text: "Confirmed. Try again." }); }} />
        </div>
      )}
      {vaultDeployed && (
        <>
          <Field label="Sign with" htmlFor={`w-${campaignId}`}>
            <select id={`w-${campaignId}`} className={`${inputClass} max-w-xs`} value={walletId} onChange={(e) => setWalletId(e.target.value)}>
              {wallets.map((w) => <option key={w.id} value={w.id} disabled={!w.available}>{w.name}</option>)}
            </select>
          </Field>
          {!registered ? (
            <Button
              disabled={busy || !walletId}
              onClick={() =>
                run({ action: "plan_register", campaignId }, (txHash) => ({ action: "confirm_register", campaignId, txHash }))
              }
            >
              Set up the prize vault
            </Button>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label={`Amount (${token.symbol})`} htmlFor={`a-${campaignId}`}>
                <input id={`a-${campaignId}`} inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Button disabled={busy || !amount || !walletId} onClick={() => run({ action: "plan_deposit", campaignId, amount }, (txHash, plan) => ({ action: "confirm_deposit", orderId: plan.orderId, txHash }))}>
                Deposit prize
              </Button>
            </div>
          )}
        </>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}

