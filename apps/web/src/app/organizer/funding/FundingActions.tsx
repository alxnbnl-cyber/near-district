"use client";

import { FIXED_REWARDS_ENABLED } from "@/lib/features";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "@yielvy/core";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { sendTransactions, walletOptions, type WalletOption, type FnCall } from "@/lib/wallet";
import { WalletChooser } from "@/components/auth/WalletChooser";

type Plan = { signerId: string; transactions: FnCall[]; orderId?: string };
interface Origin { assetId: string; blockchain: string; symbol: string; decimals: number }

export function FundingActions({ campaignId, registered, vaultDeployed, token, defaultKind = "bonus" }: { campaignId: string; registered: boolean; vaultDeployed: boolean; token: { symbol: string; decimals: number }; defaultKind?: "bonus" | "principal" }) {
  const router = useRouter();
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [walletId, setWalletId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"principal" | "bonus">(FIXED_REWARDS_ENABLED ? defaultKind : "principal");
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
      setMsg({ tone: r.state === "FAILED" ? "danger" : "ok", text: r.state === "FAILED" ? "The vault did not accept that deposit. Any tokens were returned by the token contract." : "Confirmed on-chain." });
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
                run({ action: "plan_register", campaignId, maxOperatorReservePerPeriod: "0", requireSponsorFinalize: true }, (txHash) => ({ action: "confirm_register", campaignId, txHash }))
              }
            >
              Set up the prize vault
            </Button>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
              <Field label="Deposit as" htmlFor={`k-${campaignId}`}>
                <select id={`k-${campaignId}`} className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as "bonus")}>
                  {FIXED_REWARDS_ENABLED && <option value="bonus">Prize budget</option>}
                  <option value="principal">Interest deposit (you keep it)</option>
                </select>
              </Field>
              <Field label={`Amount (${token.symbol})`} htmlFor={`a-${campaignId}`}>
                <input id={`a-${campaignId}`} inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Button disabled={busy || !amount || !walletId} onClick={() => run({ action: "plan_deposit", campaignId, kind, amount }, (txHash, plan) => ({ action: "confirm_deposit", orderId: plan.orderId, txHash }))}>
                Deposit
              </Button>
            </div>
          )}
        </>
      )}
      <CrossChainQuote campaignId={campaignId} token={token} vaultDeployed={vaultDeployed} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}

function CrossChainQuote({ campaignId, token, vaultDeployed }: { campaignId: string; token: { symbol: string; decimals: number }; vaultDeployed: boolean }) {
  const [origins, setOrigins] = useState<Origin[] | null>(null);
  const [origin, setOrigin] = useState("");
  const [amount, setAmount] = useState("25");
  const [refundTo, setRefundTo] = useState("");
  const [quote, setQuote] = useState<{ amountIn: string; amountOut: string; minAmountOut: string; timeEstimate?: number; depositAddress?: string; deadline?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || origins) return;
    api<Origin[]>("/api/organizer/funding", { method: "POST", body: { action: "origins" } })
      .then((o) => { setOrigins(o); setOrigin(o.find((x) => x.blockchain === "base")?.assetId ?? o[0]?.assetId ?? ""); })
      .catch((e) => setError(e.message));
  }, [open, origins]);

  if (!open) return <div><Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Paying from another chain?</Button></div>;
  const o = origins?.find((x) => x.assetId === origin);
  return (
    <div className="rounded-md border border-line bg-paper p-4">
      <p className="text-sm font-semibold">Bridge with NEAR Intents</p>
      <p className="text-[12.5px] text-ink-3">Quotes are live from the 1Click API. {token.symbol} arrives in your own NEAR wallet; you then deposit it above.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="From" htmlFor={`o-${campaignId}`}>
          <select id={`o-${campaignId}`} className={inputClass} value={origin} onChange={(e) => setOrigin(e.target.value)}>
            {origins?.map((x) => <option key={x.assetId} value={x.assetId}>{x.symbol} on {x.blockchain}</option>)}
          </select>
        </Field>
        <Field label="Amount" htmlFor={`oa-${campaignId}`}>
          <input id={`oa-${campaignId}`} inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Refund address (source chain)" htmlFor={`rf-${campaignId}`}>
          <input id={`rf-${campaignId}`} className={inputClass} value={refundTo} onChange={(e) => setRefundTo(e.target.value)} placeholder="0x…" />
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          disabled={!o || !refundTo}
          onClick={async () => {
            setError(null);
            setQuote(null);
            try {
              const units = parseUnits(amount, o!.decimals).toString();
              const r = await api<{ quote: typeof quote }>("/api/organizer/funding", { method: "POST", body: { action: "quote", campaignId, originAssetId: origin, amount: units, refundTo, dry: !vaultDeployed } });
              setQuote(r.quote);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Quote failed.");
            }
          }}
        >
          {vaultDeployed ? "Get deposit quote" : "Preview quote"}
        </Button>
      </div>
      {error && <div className="mt-3"><Notice tone="danger">{error}</Notice></div>}
      {quote && o && (
        <div className="mt-3 rounded-md bg-card p-3 text-sm">
          <p>You send <strong>{formatUnits(BigInt(quote.amountIn), o.decimals)} {o.symbol}</strong> on {o.blockchain}.</p>
          <p>You receive about <strong>{formatUnits(BigInt(quote.amountOut), token.decimals)} {token.symbol}</strong> on NEAR (at least {formatUnits(BigInt(quote.minAmountOut), token.decimals)}).</p>
          {quote.timeEstimate && <p className="text-ink-3">Typical time: ~{quote.timeEstimate}s.</p>}
          {quote.depositAddress ? (
            <p className="mt-2">Send exactly that amount to <code className="break-all rounded bg-paper-2 px-1">{quote.depositAddress}</code> before {quote.deadline ? new Date(quote.deadline).toLocaleTimeString() : "the deadline"}. We track the transfer and tell you when it lands.</p>
          ) : (
            <p className="mt-2 text-ink-3">Preview only — no deposit address was issued and nothing can be sent.</p>
          )}
        </div>
      )}
    </div>
  );
}
