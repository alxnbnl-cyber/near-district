import { CoinStack, LinkedVaults, TreasureChest, TreasureMap } from "@/components/art/Art";

const CARDS = [
  { art: TreasureMap, title: "1 · Build a mission", body: "Write a few questions about your project. Add hints players unlock by doing an activity." },
  { art: CoinStack, title: "2 · Fund the prize", body: "Put up a reward budget, or deposit funds and use the interest they earn as the prize." },
  { art: TreasureChest, title: "3 · Players play", body: "Explorers find your mission on the map, solve the trail and learn your product." },
  { art: LinkedVaults, title: "4 · Team up", body: "Link your missions with partners into one bigger trail." },
];

/** A short illustrated guide that lives inside the dashboard. */
export function HowItWorks({ open = false }: { open?: boolean }) {
  return (
    <details open={open} className="group rounded-[18px] border border-line bg-card">
      <summary className="flex cursor-pointer items-center justify-between px-5 py-4 font-display text-[16px] font-semibold">
        How it works
        <span className="text-[12px] font-medium text-ink-3 group-open:hidden">Show guide</span>
      </summary>
      <ol className="yv-stagger grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((c) => (
          <li key={c.title} className="rounded-[14px] border border-line bg-paper p-4">
            <c.art size={64} />
            <p className="mt-2 font-semibold">{c.title}</p>
            <p className="mt-1 text-[13px] text-ink-2">{c.body}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}
