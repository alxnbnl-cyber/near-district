"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { sendTransactions, walletOptions, type WalletOption } from "@/lib/wallet";
import { GameIcon } from "@/components/host/GameIcon";
import { frame, plate } from "./frame";

const INK = "rgb(214 219 225";

interface WalletInfo {
  account: string | null;
  network: "mainnet" | "testnet";
  symbol: string;
  decimals: number;
  tokenId: string;
  balance: string | null;
  balanceRaw: string | null;
  mode: "testnet" | "simulated" | "off";
  offrampAccount: string | null;
  explorer: string | null;
}

/** "12.5" → smallest units, without floating point. */
function toUnits(v: string, decimals: number): bigint | null {
  if (!/^\d+(\.\d+)?$/.test(v.trim())) return null;
  const [w, f = ""] = v.trim().split(".");
  if (f.length > decimals) return null;
  return BigInt(w!) * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}

/** Wallet balance + "Cash out" entry, shown in the Progress panel. */
export function WalletCard() {
  const [w, setW] = useState<WalletInfo | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => {
    api<WalletInfo>("/api/me/wallet").then(setW).catch(() => setW(null));
  }, []);
  useEffect(load, [load]);
  // no NEAR account (e.g. signed in with an EVM / Solana wallet): prizes route through NEAR Intents instead
  if (!w || w.mode === "off" || !w.account) return null;

  return (
    <>
      <div className="mt-3 flex items-center gap-3 bg-[rgb(10_13_18/.6)] p-3" style={frame(10, `${INK} / .14)`)}>
        <GameIcon name="earn" size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.5)]">Wallet · {w.network}</p>
          {w.account ? (
            <p className="font-display text-[17px] font-bold text-white">
              {w.balance ?? "—"} <span className="text-[11px] text-[rgb(214_219_225/.6)]">{w.symbol}</span>
            </p>
          ) : (
            <Link href="/me/profile" className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-gold hover:underline">
              Link a NEAR wallet
            </Link>
          )}
        </div>
        {w.account && (
          <button type="button" onClick={() => setOpen(true)} className="h-9 bg-orange px-3.5 text-[10.5px] font-black uppercase tracking-[0.16em] text-[#140c05]" style={plate(8)}>
            Cash out
          </button>
        )}
      </div>
      {open && w.account && (
        <CashOutModal
          wallet={w}
          onClose={() => {
            setOpen(false);
            load();
          }}
        />
      )}
    </>
  );
}

type Step = "form" | "wallet" | "sending" | "processing" | "done";

/** Cash out to a bank (testnet demo). The on-chain transfer is real on testnet; the bank payout is simulated. */
function CashOutModal({ wallet, onClose }: { wallet: WalletInfo; onClose(): void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"bank" | "card">("bank");
  const [step, setStep] = useState<Step>("form");
  const [wallets, setWallets] = useState<WalletOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<{ url: string; amount: string } | null>(null);
  const [stage, setStage] = useState(0);

  const units = toUnits(amount, wallet.decimals);
  const max = BigInt(wallet.balanceRaw ?? "0");
  const valid = units !== null && units > 0n && units <= max;
  const onchain = wallet.mode === "testnet";

  useEffect(() => {
    if (step === "wallet" && !wallets) walletOptions().then(setWallets).catch(() => setWallets([]));
  }, [step, wallets]);

  // simulated payout timeline once the transfer is confirmed (or straight away in simulation mode)
  useEffect(() => {
    if (step !== "processing") return;
    const ts = [setTimeout(() => setStage(1), 900), setTimeout(() => setStage(2), 2100), setTimeout(() => setStep("done"), 3200)];
    return () => ts.forEach(clearTimeout);
  }, [step]);

  const start = () => {
    setError(null);
    if (!valid) return setError(units !== null && units > max ? "That's more than your wallet holds." : "Enter an amount.");
    if (onchain) setStep("wallet");
    else {
      setTx({ url: "", amount });
      setStep("processing");
    }
  };

  const send = async (walletId: string) => {
    setStep("sending");
    setError(null);
    try {
      const hashes = await sendTransactions(walletId, wallet.account!, [
        { receiverId: wallet.tokenId, methodName: "ft_transfer", args: { receiver_id: wallet.offrampAccount, amount: units!.toString(), memo: "yielvy cash-out (testnet)" }, gasTgas: 30, depositYocto: "1" },
      ]);
      const hash = hashes.at(-1);
      if (!hash) throw new Error("Your wallet didn't report the transaction. Check your wallet and try again.");
      let r: { verified: boolean; reason?: string; amount?: string; txUrl?: string } = { verified: false };
      for (let i = 0; i < 6 && !r.verified; i++) {
        r = await api("/api/me/offramp", { method: "POST", body: { txHash: hash } });
        if (!r.verified) await new Promise((res) => setTimeout(res, 2500));
      }
      if (!r.verified) throw new Error(r.reason ?? "Couldn't confirm the transfer yet.");
      setTx({ url: r.txUrl!, amount: r.amount! });
      setStep("processing");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "The transfer didn't go through.");
      setStep("wallet");
    }
  };

  const stages = [
    { label: onchain ? `${wallet.symbol} received on testnet` : `${wallet.symbol} sent (simulated)`, done: stage >= 0 && (step === "processing" || step === "done") },
    { label: `Converted to USD at 1.00 (simulated)`, done: stage >= 1 || step === "done" },
    { label: method === "bank" ? "Sent to your bank (simulated)" : "Sent to your card (simulated)", done: stage >= 2 || step === "done" },
  ];

  return (
    <div className="fixed inset-0 z-[75] grid place-items-center bg-black/60 p-3 backdrop-blur-[3px]" role="dialog" aria-modal="true" aria-label="Cash out" onClick={step === "sending" ? undefined : onClose}>
      <div className="yv-pop w-full max-w-[440px] bg-[rgb(6_8_11/.95)] p-6 font-mono backdrop-blur-xl" style={frame(18, "rgb(255 145 56 / .45)")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.26em] text-orange">Cash out</p>
            <h2 className="mt-1 font-display text-[24px] font-bold uppercase leading-tight text-white">Withdraw your prize</h2>
          </div>
          {step !== "sending" && (
            <button type="button" aria-label="Close" onClick={onClose} className="text-[rgb(214_219_225/.5)] hover:text-white">
              ✕
            </button>
          )}
        </div>
        <p className="mt-2 bg-[rgb(255_194_75/.08)] px-3 py-2 text-[10.5px] font-bold uppercase leading-relaxed tracking-[0.12em] text-gold">
          Testnet demo · {onchain ? "the token transfer is real on testnet, the bank payout is simulated" : "simulated end to end, no transaction is sent"}
        </p>

        {step === "form" && (
          <div className="mt-5">
            <label htmlFor="co-amt" className="text-[10px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.55)]">
              Amount
            </label>
            <div className="mt-1.5 flex items-stretch">
              <input
                id="co-amt"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-12 min-w-0 flex-1 border border-[rgb(255_255_255/.14)] bg-[rgb(60_76_100/.12)] px-3 text-[18px] text-white placeholder:text-[rgb(214_219_225/.3)] focus:border-orange focus:outline-none"
              />
              <button type="button" onClick={() => setAmount(wallet.balance?.replace(/,/g, "") ?? "0")} className="border border-l-0 border-[rgb(255_255_255/.14)] px-3 text-[10.5px] font-bold uppercase tracking-[0.16em] text-orange hover:bg-[rgb(255_145_56/.08)]">
                Max
              </button>
            </div>
            <p className="mt-1 text-[10.5px] uppercase tracking-[0.14em] text-[rgb(214_219_225/.45)]">
              Available {wallet.balance ?? "—"} {wallet.symbol}
            </p>

            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.55)]">Payout to</p>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(
                [
                  ["bank", "Bank transfer", "1–2 days"],
                  ["card", "Debit card", "Minutes"],
                ] as const
              ).map(([id, label, eta]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMethod(id)}
                  aria-pressed={method === id}
                  className={`p-3 text-left ${method === id ? "bg-[rgb(255_145_56/.12)]" : "bg-[rgb(255_255_255/.03)]"}`}
                  style={frame(9, method === id ? "rgb(255 145 56 / .6)" : `${INK} / .16)`)}
                >
                  <span className="block text-[11.5px] font-bold uppercase tracking-[0.12em] text-white">{label}</span>
                  <span className="block text-[10px] uppercase tracking-[0.14em] text-[rgb(214_219_225/.5)]">{eta}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-dashed border-[rgb(255_255_255/.12)] pt-3 text-[11px] font-bold uppercase tracking-[0.14em]">
              <span className="text-[rgb(214_219_225/.55)]">You receive</span>
              <span className="text-reward">${valid ? Number(amount).toFixed(2) : "0.00"} USD</span>
            </div>
            {error && <p className="mt-3 font-sans text-[13px] text-danger">{error}</p>}
            <button type="button" onClick={start} disabled={!amount} className="mt-5 h-12 w-full bg-[linear-gradient(180deg,#ffa458,#ff8a2a)] text-[12.5px] font-black uppercase tracking-[0.18em] text-[#140c05] disabled:opacity-40" style={plate(11)}>
              {onchain ? "Continue to wallet" : "Simulate cash out"}
            </button>
          </div>
        )}

        {(step === "wallet" || step === "sending") && (
          <div className="mt-5">
            <p className="font-sans text-[14px] text-[rgb(214_219_225/.75)]">
              Approve a transfer of <span className="font-bold text-white">{amount} {wallet.symbol}</span> from <span className="font-bold text-white">{wallet.account}</span> to the cash-out account{" "}
              <span className="font-bold text-white">{wallet.offrampAccount}</span>.
            </p>
            {step === "sending" ? (
              <p className="mt-5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
                <span className="size-3 animate-spin rounded-full border-2 border-gold border-t-transparent" /> Waiting for your wallet…
              </p>
            ) : !wallets ? (
              <p className="mt-5 text-[11px] uppercase tracking-[0.2em] text-[rgb(214_219_225/.5)]">Loading wallets…</p>
            ) : (
              <div className="mt-4 grid gap-2">
                {wallets.filter((x) => x.available).map((x) => (
                  <button key={x.id} type="button" onClick={() => send(x.id)} className="flex items-center gap-3 bg-[rgb(255_255_255/.03)] p-3 text-left hover:bg-[rgb(255_145_56/.1)]" style={frame(9, `${INK} / .16)`)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={x.iconUrl} alt="" className="size-7" />
                    <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-white">{x.name}</span>
                  </button>
                ))}
              </div>
            )}
            {error && <p className="mt-3 font-sans text-[13px] text-danger">{error}</p>}
            {step === "wallet" && (
              <button type="button" onClick={() => setStep("form")} className="mt-4 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[rgb(214_219_225/.55)] hover:text-white">
                ← Back
              </button>
            )}
          </div>
        )}

        {(step === "processing" || step === "done") && (
          <div className="mt-5">
            <ol className="flex flex-col gap-3">
              {stages.map((s, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className={`grid size-6 shrink-0 place-items-center text-[11px] font-black ${s.done ? "bg-mint-ink text-[#06231a]" : "border border-[rgb(214_219_225/.3)] text-[rgb(214_219_225/.4)]"}`}>
                    {s.done ? "✓" : <span className="size-2.5 animate-spin rounded-full border-2 border-[rgb(214_219_225/.5)] border-t-transparent" />}
                  </span>
                  <span className={`text-[11.5px] font-bold uppercase tracking-[0.12em] ${s.done ? "text-white" : "text-[rgb(214_219_225/.45)]"}`}>{s.label}</span>
                </li>
              ))}
            </ol>
            {tx?.url && (
              <a href={tx.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-[10.5px] font-bold uppercase tracking-[0.16em] text-orange hover:underline">
                View testnet transaction ↗
              </a>
            )}
            {step === "done" && (
              <div className="yv-pop mt-5 bg-[rgb(110_231_183/.08)] p-4 text-center" style={frame(10, "rgb(110 231 183 / .4)")}>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-mint-ink">Cash out complete (simulated payout)</p>
                <p className="mt-1 font-display text-[26px] font-bold text-white">${Number(tx?.amount?.replace(/,/g, "") ?? amount).toFixed(2)}</p>
                <button type="button" onClick={onClose} className="mt-3 h-10 bg-orange px-6 text-[11px] font-black uppercase tracking-[0.16em] text-[#140c05]" style={plate(9)}>
                  Done
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
