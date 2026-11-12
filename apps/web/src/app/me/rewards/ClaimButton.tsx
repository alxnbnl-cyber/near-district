"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { sendTransactions, walletOptions, type WalletOption } from "@/lib/wallet";

export function ClaimButton({ allocationId, pending }: { allocationId: string; pending: boolean }) {
  const router = useRouter();
  const [wallets, setWallets] = useState<WalletOption[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);

  useEffect(() => {
    if (choosing && !wallets) walletOptions().then(setWallets).catch(() => setWallets([]));
  }, [choosing, wallets]);

  const claim = async (walletId: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const plan = await api<{ signerId: string; transactions: { receiverId: string; methodName: string; args: object; gasTgas: number; depositYocto: string }[] }>(`/api/rewards/${allocationId}`);
      const hashes = await sendTransactions(walletId, plan.signerId, plan.transactions);
      const claimHash = hashes[hashes.length - 1];
      if (!claimHash) {
        setMsg({ tone: "warn", text: "Your wallet sent the transaction but didn't report its hash. We'll confirm it from the chain shortly." });
        return;
      }
      const r = await api<{ state: string }>(`/api/rewards/${allocationId}`, { method: "POST", body: { txHash: claimHash } });
      setMsg(r.state === "CONFIRMED" ? { tone: "ok", text: "Claimed! The tokens are in your wallet." } : { tone: "danger", text: "The payout didn't go through on-chain. Nothing was paid; you can try again." });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Payout failed." });
    } finally {
      setBusy(false);
    }
  };

  if (pending) return <Notice tone="info">Payout sent — waiting for confirmation.</Notice>;
  return (
    <div className="flex min-w-48 flex-col items-end gap-2">
      {!choosing ? (
        <Button onClick={() => setChoosing(true)}>Collect now</Button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-[12px] text-ink-3">Sign with your wallet:</p>
          {wallets?.map((w) => (
            <Button key={w.id} size="sm" variant="secondary" disabled={busy || !w.available} onClick={() => claim(w.id)}>
              {busy ? "Waiting for wallet…" : w.name}
            </Button>
          ))}
        </div>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
