"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WalletChooser } from "@/components/auth/WalletChooser";
import { GameIcon } from "@/components/host/GameIcon";
import { frame, plate } from "@/components/explore/frame";
import { api, ApiError } from "@/lib/api";

const INK = "rgb(214 219 225";

/** Sign-in modal in the game style: email link or NEAR wallet. */
export function SignInForm({ next, emailAvailable }: { next: string; emailAvailable: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"email" | "wallet">(emailAvailable ? "email" : "wallet");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="yv-si-card w-full max-w-[440px] bg-[rgb(6_8_11/.88)] p-7 font-mono backdrop-blur-xl" style={frame(20, "rgb(255 145 56 / .45)", 1, { shadow: "0 30px 80px rgb(0 0 0 / .6)" })}>
      <div className="flex items-center gap-4">
        <GameIcon name="profile" size={64} />
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.28em] text-orange">Welcome, explorer</p>
          <h1 className="mt-0.5 font-display text-[26px] font-bold uppercase leading-tight tracking-[0.02em] text-white">Sign in to play</h1>
        </div>
      </div>
      <p className="mt-3 font-sans text-[14.5px] leading-relaxed text-[rgb(214_219_225/.7)]">Save your progress and keep the treasure you win.</p>

      <div role="tablist" aria-label="Sign-in method" className="mt-5 grid grid-cols-2 gap-2">
        {(["email", "wallet"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            disabled={t === "email" && !emailAvailable}
            onClick={() => setTab(t)}
            className={`h-11 text-[11.5px] font-bold uppercase tracking-[0.18em] transition-colors disabled:opacity-40 ${tab === t ? "bg-[rgb(255_145_56/.14)] text-orange" : "text-[rgb(214_219_225/.6)] hover:text-white"}`}
            style={frame(9, tab === t ? "rgb(255 145 56 / .65)" : `${INK} / .18)`)}
          >
            {t === "email" ? "Email" : "NEAR wallet"}
          </button>
        ))}
      </div>

      <div className="mt-5" role="tabpanel">
        {tab === "email" ? (
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
          <div className="[&_button]:font-mono">
            <WalletChooser
              purpose="near_login"
              returnTo={next}
              onDone={() => {
                router.push(next);
                router.refresh();
              }}
            />
          </div>
        )}
      </div>

      <ul className="mt-6 space-y-1.5 border-t border-[rgb(255_255_255/.08)] pt-4 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[rgb(214_219_225/.55)]">
        <li><span className="text-orange">▸</span> No account needed to explore the map</li>
        <li><span className="text-orange">▸</span> Link a NEAR wallet to receive prizes</li>
        <li><span className="text-orange">▸</span> We never see your wallet keys</li>
      </ul>

      <style>{`@keyframes yv-si-in { from { opacity: 0; transform: translateY(14px) scale(.97) } to { opacity: 1; transform: none } } .yv-si-card { animation: yv-si-in 420ms cubic-bezier(.2,.8,.2,1) both } @media (prefers-reduced-motion: reduce) { .yv-si-card { animation: none } }`}</style>
    </div>
  );
}
