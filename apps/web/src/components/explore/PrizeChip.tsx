import type { Prize } from "@/world/types";
import { IconTrophy } from "./icons";

/**
 * Gold = something you can win. Shows the verified on-chain prize pool when we have one,
 * "Token prize" when the quest is funded but no snapshot exists yet, and "Just for fun" otherwise.
 */
export function PrizeChip({ prize, rewards, size = "sm", className = "" }: { prize: Prize | null; rewards: "none" | "token"; size?: "sm" | "lg"; className?: string }) {
  if (rewards === "none" && !prize) {
    return <span className={`inline-flex items-center gap-1 rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-ink-3 ${className}`}>Just for fun</span>;
  }
  const lg = size === "lg";
  return (
    <span
      className={`yv-shine inline-flex items-center gap-1.5 rounded-full bg-reward font-display font-bold text-[#2a1600] ${lg ? "px-3.5 py-1.5 text-[15px]" : "px-2.5 py-0.5 text-[11.5px]"} ${className}`}
    >
      <IconTrophy size={lg ? 17 : 13} />
      {prize?.kind === "yield" && <span className="opacity-70">Yield</span>}
      {prize ? `${prize.amount} ${prize.symbol}` : "Token prize"}
      {prize?.demo && <span className="rounded-sm bg-[#2a1600]/20 px-1 text-[0.72em] tracking-wider">DEMO</span>}
    </span>
  );
}
