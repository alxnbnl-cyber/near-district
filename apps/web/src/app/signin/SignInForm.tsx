"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WalletChooser } from "@/components/auth/WalletChooser";
import { GameIcon } from "@/components/host/GameIcon";
import { frame, plate } from "@/components/explore/frame";
import { api, ApiError } from "@/lib/api";
import { nearAuthAvailable, signInWithNearAuth } from "@/lib/near-auth";
import { signInWithEvm, signInWithSolana } from "@/lib/external-wallets";
import { CloseLink } from "./CloseLink";

const INK = "rgb(214 219 225";

/** Sign-in modal in the game style: email link or NEAR wallet. */
export function SignInForm({ next, emailAvailable, closeHref = "/explore", onClose }: { next: string; emailAvailable: boolean; closeHref?: string; onClose?(): void }) {
  const router = useRouter();
  const [tab, setTab] = useState<"email" | "wallet">(emailAvailable || nearAuthAvailable() ? "email" : "wallet");
  const [linkMode, setLinkMode] = useState(!nearAuthAvailable());
  const [authBusy, setAuthBusy] = useState(false);
  const [web3Busy, setWeb3Busy] = useState<"evm" | "solana" | null>(null);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="yv-si-card relative w-full max-w-[440px] bg-[rgb(6_8_11/.88)] p-7 font-mono backdrop-blur-xl" style={frame(20, "rgb(255 145 56 / .45)", 1, { shadow: "0 30px 80px rgb(0 0 0 / .6)" })}>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="Close sign in" className="absolute right-5 top-5 grid size-9 place-items-center text-[16px] text-[rgb(214_219_225/.6)] transition-colors hover:text-white" style={frame(8, `${INK} / .25)`)}>
          ✕
        </button>
      ) : (
      <CloseLink href={closeHref} label="Close sign in" className="absolute right-5 top-5 grid size-9 place-items-center text-[16px] text-[rgb(214_219_225/.6)] transition-colors hover:text-white" style={frame(8, `${INK} / .25)`)}>
        ✕
      </CloseLink>
      )}
      <div className="flex items-center gap-4 pr-10">
        <GameIcon name="profile" size={64} />
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.28em] text-orange">Welcome, explorer</p>
          <h1 className="mt-0.5 font-display text-[26px] font-bold uppercase leading-tight tracking-[0.02em] text-white">Sign in to play</h1>
        </div>
      </div>

      <div role="tablist" aria-label="Sign-in method" className="mt-5 grid grid-cols-2 gap-2">
        {(["email", "wallet"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            disabled={t === "email" && !emailAvailable && !nearAuthAvailable()}
            onClick={() => setTab(t)}
            className={`h-11 text-[11.5px] font-bold uppercase tracking-[0.18em] transition-colors disabled:opacity-40 ${tab === t ? "bg-[rgb(255_145_56/.14)] text-orange" : "text-[rgb(214_219_225/.6)] hover:text-white"}`}
            style={frame(9, tab === t ? "rgb(255 145 56 / .65)" : `${INK} / .18)`)}
          >
            {t === "email" ? "Google / Email" : "Web3 wallet"}
          </button>
        ))}
      </div>

      <div className="mt-5" role="tabpanel">
        {tab === "email" && !linkMode ? (
          <div className="flex flex-col gap-3 font-sans">
            <button
              type="button"
              disabled={authBusy}
              onClick={async () => {
                setError(null);
                setAuthBusy(true);
                try {
                  await signInWithNearAuth();
                  router.push(next);
                  router.refresh();
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Sign-in didn't complete.");
                  setAuthBusy(false);
                }
              }}
              className="h-12 bg-[linear-gradient(180deg,#ffa458,#ff8a2a)] font-mono text-[12.5px] font-black uppercase tracking-[0.16em] text-[#140c05] shadow-[0_0_24px_rgb(255_145_56/.35)] disabled:opacity-50"
              style={plate(11)}
            >
              {authBusy ? "Waiting for sign-in…" : "Continue with Google or email"}
            </button>
            <p className="text-[12.5px] text-[rgb(214_219_225/.55)]">A NEAR wallet is created for you automatically. No seed phrase.</p>
            {error && <p className="text-[13px] text-danger">{error}</p>}
            {emailAvailable && (
              <button type="button" onClick={() => setLinkMode(true)} className="self-start text-[12px] text-[rgb(214_219_225/.55)] underline-offset-2 hover:text-white hover:underline">
                Use a one-time email link instead
              </button>
            )}
          </div>
        ) : tab === "email" ? (
          state === "sent" ? (
            <div className="bg-[rgb(110_231_183/.08)] p-4" style={frame(10, "rgb(110 231 183 / .4)")}>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-mint-ink">Check your inbox</p>
              <p className="mt-1 font-sans text-[14px] text-[rgb(214_219_225/.8)]">
                We sent a one-time link to <strong className="text-white">{email}</strong>. It expires in 15 minutes.
              </p>
            </div>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setState("sending");
                try {
                  await api("/api/auth/email/start", { method: "POST", body: { email } });
                  setState("sent");
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : "Could not send the link.");
                  setState("idle");
                }
              }}
            >
              <label htmlFor="email" className="text-[10px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.55)]">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-12 w-full border border-[rgb(255_255_255/.14)] bg-[rgb(60_76_100/.12)] px-3.5 text-[15px] text-white placeholder:text-[rgb(214_219_225/.3)] focus:border-orange focus:outline-none"
              />
              {error && <p className="font-sans text-[13px] text-danger">{error}</p>}
              <button
                type="submit"
                disabled={state === "sending"}
                className="mt-1 h-12 bg-[linear-gradient(180deg,#ffa458,#ff8a2a)] text-[12.5px] font-black uppercase tracking-[0.18em] text-[#140c05] shadow-[0_0_24px_rgb(255_145_56/.35)] transition-shadow hover:shadow-[0_0_34px_rgb(255_145_56/.55)] disabled:opacity-50"
                style={plate(11)}
              >
                {state === "sending" ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>
          )
        ) : (
          <div className="flex flex-col gap-4 font-sans">
            <div>
              <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.5)]">NEAR</p>
              <WalletChooser
                purpose="near_login"
                hideNote
                returnTo={next}
                onDone={() => {
                  router.push(next);
                  router.refresh();
                }}
              />
            </div>
            <div>
              <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.5)]">EVM & Solana</p>
              <div className="grid gap-2">
                {(
                  [
                    ["evm", "MetaMask, Rabby, Coinbase", "EVM wallet"],
                    ["solana", "Phantom, Solflare, Backpack", "Solana wallet"],
                  ] as const
                ).map(([chain, hint, label]) => (
                  <button
                    key={chain}
                    type="button"
                    disabled={web3Busy !== null}
                    onClick={async () => {
                      setError(null);
                      setWeb3Busy(chain);
                      try {
                        await (chain === "evm" ? signInWithEvm() : signInWithSolana());
                        router.push(next);
                        router.refresh();
                      } catch (err) {
                        setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Sign-in didn't complete.");
                        setWeb3Busy(null);
                      }
                    }}
                    className="flex h-12 w-full items-center justify-between rounded-md border border-line-strong bg-card px-3 text-left text-sm font-semibold hover:border-ink-3 disabled:opacity-50"
                  >
                    <span>{label}</span>
                    <span className="text-[12px] font-medium text-ink-3">{web3Busy === chain ? "Waiting for wallet…" : hint}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-[rgb(214_219_225/.5)]">Prizes reach EVM and Solana wallets through NEAR Intents.</p>
              {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
            </div>
          </div>
        )}
      </div>


      <style>{`@keyframes yv-si-in { from { opacity: 0; transform: translateY(18px) scale(.96); filter: blur(6px) } to { opacity: 1; transform: none; filter: none } } .yv-si-card { animation: yv-si-in 520ms cubic-bezier(.16,1,.3,1) 120ms both; } @keyframes yv-si-out { to { opacity: 0; transform: translateY(12px) scale(.96); filter: blur(4px) } } [data-closing] .yv-si-card { animation: yv-si-out 240ms ease-in both } @media (prefers-reduced-motion: reduce) { .yv-si-card { animation: none } }`}</style>
    </div>
  );
}
