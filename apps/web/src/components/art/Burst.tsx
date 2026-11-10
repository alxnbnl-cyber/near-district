"use client";

import { useEffect, useState } from "react";

/** A short coin + spark burst for wins (correct answers, unlocked hints). Respects reduced motion via CSS. */
export function Burst({ trigger, className = "" }: { trigger: number; className?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    setShown(trigger);
    const t = setTimeout(() => setShown(0), 1300);
    return () => clearTimeout(t);
  }, [trigger]);
  if (!shown) return null;
  const parts = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2 + (i % 2) * 0.2;
    const d = 70 + (i % 4) * 22;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d - 30, coin: i % 3 === 0, delay: (i % 5) * 25 };
  });
  return (
    <div aria-hidden key={shown} className={`pointer-events-none absolute inset-0 z-20 grid place-items-center ${className}`}>
      {parts.map((p, i) => (
        <span
          key={i}
          className="absolute block"
          style={{
            width: p.coin ? 14 : 7,
            height: p.coin ? 14 : 7,
            borderRadius: 999,
            background: p.coin ? "linear-gradient(180deg,#FFE08A,#F5A524)" : i % 2 ? "#FF9138" : "#32C8EF",
            boxShadow: p.coin ? "0 0 0 2px #0b0f15" : "none",
            animation: `yv-burst 1100ms cubic-bezier(.15,.7,.3,1) ${p.delay}ms both`,
            ["--bx" as string]: `${p.x}px`,
            ["--by" as string]: `${p.y}px`,
          }}
        />
      ))}
      <style>{`@keyframes yv-burst { 0% { transform: translate(0,0) scale(.4); opacity: 1 } 70% { opacity: 1 } 100% { transform: translate(var(--bx), calc(var(--by) + 60px)) scale(1); opacity: 0 } }`}</style>
    </div>
  );
}
