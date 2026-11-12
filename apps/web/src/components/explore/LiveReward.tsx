"use client";

import type { Prize } from "@/world/types";

/** Dollar sign for dollar stablecoins; other tokens show their symbol after the number. */
export const isDollar = (symbol: string) => /^(USD|USDC|USDT)(\.e)?$/.test(symbol);

/** A mission's fixed prize, e.g. "$100.00" (NEAR District prizes are fixed: no yield, no ticking). */
export function LiveReward({ prize, className = "" }: { prize: Prize; className?: string; tailClassName?: string }) {
  const n = Number(prize.amount.replace(/,/g, "")) || 0;
  const text = n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dollar = isDollar(prize.symbol);
  return <span className={`tabular-nums ${className}`}>{dollar ? `$${text}` : `${text} ${prize.symbol}`}</span>;
}
