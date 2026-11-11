"use client";

import { useEffect, useState } from "react";
import { SignInForm } from "@/app/signin/SignInForm";

/** Sign in right on top of the live map (no page change). */
export function SignInModal({ next, onClose }: { next: string; onClose(): void }) {
  const [closing, setClosing] = useState(false);
  const close = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onClose();
    setClosing(true);
    setTimeout(onClose, 240);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div {...(closing ? { "data-closing": "1" } : {})} className="fixed inset-0 z-[75] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Sign in">
      <div className="yv-sim-bg absolute inset-0 bg-[rgb(3_5_8/.62)] backdrop-blur-[3px]" onClick={close} />
      <div className="relative w-full max-w-[440px]">
        <SignInForm next={next} emailAvailable onClose={close} />
      </div>
      <style>{`
        @keyframes yv-sim-bg-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes yv-sim-bg-out { to { opacity: 0 } }
        .yv-sim-bg { animation: yv-sim-bg-in 280ms ease-out both }
        [data-closing] .yv-sim-bg { animation: yv-sim-bg-out 240ms ease-in both }
        @media (prefers-reduced-motion: reduce) { .yv-sim-bg { animation: none } }
      `}</style>
    </div>
  );
}
