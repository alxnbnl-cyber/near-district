"use client";

import { useEffect, useRef } from "react";
import type { Prize } from "@/world/types";

/** One shared clock so every counter on the page agrees. */
const T0 = typeof performance !== "undefined" ? performance.now() : 0;

/** Dollar sign for dollar stablecoins; other tokens show their symbol after the number. */
export const isDollar = (symbol: string) => symbol === "USDC" || symbol === "USDT";

/** Reward pool and, for growing (yield-funded) rewards with a known APY, how much it adds per day. */
export function rewardRate(p: Prize): { amount: number; perDay: number | null } {
  const amount = Number(p.amount.replace(/,/g, "")) || 0;
  const apy = p.apy ? parseFloat(p.apy) : NaN;
  return { amount, perDay: p.kind === "yield" && apy > 0 ? (amount * apy) / 100 / 365 : null };
}

export function formatRate(perDay: number, symbol: string) {
  const n = perDay < 0.01 ? perDay.toFixed(4) : perDay < 10 ? perDay.toFixed(2) : Math.round(perDay).toLocaleString("en");
  return isDollar(symbol) ? `+$${n}/day` : `+${n} ${symbol}/day`;
}

/**
 * "Up to $1,375.00" whose fractional tail keeps ticking up for growing rewards, so players can see
 * the pool earning. Updates the DOM directly (no React renders).
 */
export function LiveReward({ prize, className = "", tailClassName = "opacity-45" }: { prize: Prize; className?: string; tailClassName?: string }) {
  const { amount, perDay } = rewardRate(prize);
  const main = useRef<HTMLSpanElement>(null);
  const tail = useRef<HTMLSpanElement>(null);
  const dollar = isDollar(prize.symbol);

  useEffect(() => {
    const paint = () => {
      const v = amount + (perDay ? (perDay / 86_400_000) * (performance.now() - T0) : 0);
      const [int, frac = ""] = v.toFixed(6).split(".");
      if (main.current) main.current.textContent = `${dollar ? "$" : ""}${Number(int).toLocaleString("en")}.${frac.slice(0, 2)}`;
      if (tail.current) tail.current.textContent = perDay ? frac.slice(2) : "";
    };
    paint();
    if (!perDay) return;
    const t = setInterval(paint, 90);
    return () => clearInterval(t);
  }, [amount, perDay, dollar]);

  return (
    <span className={`tabular-nums ${className}`}>
      <span ref={main} />
      <span ref={tail} className={tailClassName} />
      {!dollar && ` ${prize.symbol}`}
    </span>
  );
}
