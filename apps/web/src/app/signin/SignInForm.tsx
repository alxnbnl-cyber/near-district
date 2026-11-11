"use client";

import { useRouter } from "next/navigation";
import { WalletChooser } from "@/components/auth/WalletChooser";
import { GameIcon } from "@/components/host/GameIcon";
import { frame } from "@/components/explore/frame";
import { CloseLink } from "./CloseLink";

const INK = "rgb(214 219 225";

/** Sign in with a NEAR wallet (Meteor, MyNearWallet). NEAR District is NEAR-only. */
export function SignInForm({ next, closeHref = "/explore", onClose }: { next: string; closeHref?: string; onClose?(): void }) {
  const router = useRouter();
  const closeCls = "absolute right-5 top-5 grid size-9 place-items-center text-[16px] text-[rgb(214_219_225/.6)] transition-colors hover:text-white";

  return (
    <div className="yv-si-card relative w-full max-w-[440px] bg-[rgb(6_8_11/.88)] p-7 font-mono backdrop-blur-xl" style={frame(20, "rgb(255 145 56 / .45)", 1, { shadow: "0 30px 80px rgb(0 0 0 / .6)" })}>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="Close sign in" className={closeCls} style={frame(8, `${INK} / .25)`)}>
          ✕
        </button>
      ) : (
        <CloseLink href={closeHref} label="Close sign in" className={closeCls} style={frame(8, `${INK} / .25)`)}>
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

      <div className="mt-6 font-sans">
        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[rgb(214_219_225/.5)]">Connect your NEAR wallet</p>
        <WalletChooser
          purpose="near_login"
          hideNote
          returnTo={next}
          onDone={() => {
            router.push(next);
            router.refresh();
          }}
        />
        <p className="mt-3 text-[12px] text-[rgb(214_219_225/.5)]">Prizes are paid straight to this wallet.</p>
      </div>

      <style>{`@keyframes yv-si-in { from { opacity: 0; transform: translateY(18px) scale(.96); filter: blur(6px) } to { opacity: 1; transform: none; filter: none } } .yv-si-card { animation: yv-si-in 520ms cubic-bezier(.16,1,.3,1) 120ms both; } @keyframes yv-si-out { to { opacity: 0; transform: translateY(12px) scale(.96); filter: blur(4px) } } [data-closing] .yv-si-card { animation: yv-si-out 240ms ease-in both } @media (prefers-reduced-motion: reduce) { .yv-si-card { animation: none } }`}</style>
    </div>
  );
}
