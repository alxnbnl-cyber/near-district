"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { hasEvm, hasSolana, linkEvmWallet, linkSolanaWallet } from "@/lib/external-wallets";
import { frame } from "./frame";

const INK = "rgb(214 219 225";

type Dest = { kind: "near" } | { kind: "evm"; chain: "base" | "arbitrum" | "ethereum"; address: string } | { kind: "solana"; address: string };
interface Data {
  wallets: { chain: "evm" | "solana"; address: string; walletApp: string | null }[];
  payout: Dest;
}

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const EVM_CHAINS = [
  ["base", "Base"],
  ["arbitrum", "Arbitrum"],
  ["ethereum", "Ethereum"],
] as const;

/**
 * Where prizes go: the NEAR wallet (paid directly), or an EVM chain / Solana via NEAR Intents.
 * Intents only exists on mainnet, so on testnet the cross-chain hop is shown as simulated.
 */
export function PayoutCard({ network }: { network: "mainnet" | "testnet" }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const load = useCallback(() => {
    api<Data>("/api/me/payout").then(setData).catch(() => setData({ wallets: [], payout: { kind: "near" } }));
  }, []);
  useEffect(load, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "ok", text: ok });
      load();
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  };
  const choose = (d: Dest) => run("dest", () => api("/api/me/payout", { method: "PUT", body: d }), "Payout destination saved");

  if (!data) return null;
  const evm = data.wallets.find((w) => w.chain === "evm");
  const sol = data.wallets.find((w) => w.chain === "solana");
  const p = data.payout;
  const opt = (active: boolean) =>
    `flex items-center justify-between gap-2 px-3 py-2 text-left text-[12px] transition-colors ${active ? "bg-[rgb(255_145_56/.12)] text-orange" : "bg-[rgb(255_255_255/.03)] text-[rgb(214_219_225/.8)] hover:text-white"}`;

  return (
    <section className="mt-5">
      <h3 className="flex items-center gap-2 px-1 text-[10.5px] font-bold uppercase tracking-[0.26em] text-[rgb(214_219_225/.55)]">
        Receive prizes on
        <span className="h-px flex-1 bg-[rgb(255_255_255/.08)]" />
      </h3>
      <div className="mt-2.5 bg-[rgb(10_13_18/.6)] p-3" style={frame(10, `${INK} / .12)`)}>
        <div className="grid gap-1.5 font-sans">
          <button type="button" disabled={busy !== null} onClick={() => choose({ kind: "near" })} className={opt(p.kind === "near")} style={frame(6, p.kind === "near" ? "rgb(255 145 56 / .55)" : `${INK} / .12)`)}>
            <span>NEAR wallet</span>
            <span className="text-[10.5px] opacity-70">direct</span>
          </button>
          {evm &&
            EVM_CHAINS.map(([id, label]) => {
              const on = p.kind === "evm" && p.chain === id;
              return (
                <button key={id} type="button" disabled={busy !== null} onClick={() => choose({ kind: "evm", chain: id, address: evm.address })} className={opt(on)} style={frame(6, on ? "rgb(255 145 56 / .55)" : `${INK} / .12)`)}>
                  <span>
                    {label} <span className="opacity-60">· {short(evm.address)}</span>
                  </span>
                  <span className="text-[10.5px] opacity-70">via NEAR Intents</span>
                </button>
              );
            })}
          {sol && (
            <button type="button" disabled={busy !== null} onClick={() => choose({ kind: "solana", address: sol.address })} className={opt(p.kind === "solana")} style={frame(6, p.kind === "solana" ? "rgb(255 145 56 / .55)" : `${INK} / .12)`)}>
              <span>
                Solana <span className="opacity-60">· {short(sol.address)}</span>
              </span>
              <span className="text-[10.5px] opacity-70">via NEAR Intents</span>
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 font-sans">
          {!evm && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("evm", linkEvmWallet, "EVM wallet linked")}
              className="h-9 px-3 text-[12px] text-[rgb(214_219_225/.85)] hover:text-white disabled:opacity-50"
              style={frame(7, `${INK} / .22)`)}
              title={hasEvm() ? "" : "Install MetaMask or Rabby"}
            >
              {busy === "evm" ? "Waiting for wallet…" : "+ Connect EVM wallet"}
            </button>
          )}
          {!sol && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("sol", linkSolanaWallet, "Solana wallet linked")}
              className="h-9 px-3 text-[12px] text-[rgb(214_219_225/.85)] hover:text-white disabled:opacity-50"
              style={frame(7, `${INK} / .22)`)}
              title={hasSolana() ? "" : "Install Phantom"}
            >
              {busy === "sol" ? "Waiting for wallet…" : "+ Connect Solana wallet"}
            </button>
          )}
        </div>
        {msg && <p className={`mt-2 font-sans text-[12.5px] ${msg.tone === "ok" ? "text-mint-ink" : "text-danger"}`}>{msg.text}</p>}
        {p.kind !== "near" && network === "testnet" && (
          <p className="mt-2 font-sans text-[12px] text-gold">Testnet: prizes land in your NEAR wallet; the cross-chain hop is simulated (NEAR Intents is mainnet only).</p>
        )}
      </div>
    </section>
  );
}
