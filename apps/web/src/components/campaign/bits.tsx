import type { CampaignRules, CampaignState } from "@yielvy/core";
import { Badge } from "@/components/ui";

export const TEMPLATE_LABEL: Record<string, string> = {
  treasure_hunt: "Mission",
  creative_contest: "Creative Challenge",
  product_explorer: "Product Explorer",
  more_experiences: "More missions",
};

export function StatusBadge({ status }: { status: CampaignState }) {
  const map: Partial<Record<CampaignState, [string, "orange" | "sky" | "gold" | "neutral" | "mint" | "danger"]>> = {
    LIVE: ["Live", "orange"],
    SCHEDULED: ["Upcoming", "sky"],
    PAUSED: ["Paused", "gold"],
    ENDED: ["Ended", "neutral"],
    AWAITING_RESULTS: ["Awaiting results", "gold"],
    COMPLETED: ["Completed", "mint"],
    DRAFT: ["Draft", "neutral"],
    PENDING_FUNDING: ["Needs funding", "gold"],
    SUSPENDED: ["Suspended", "danger"],
  };
  const [label, tone] = map[status] ?? [status, "neutral"];
  return (
    <Badge tone={tone} dot={status === "LIVE"}>
      {label}
    </Badge>
  );
}

const MODE_COPY: Record<string, (r: CampaignRules) => string> = {
  equal: () => "When the deadline ends, everyone who answered every clue correctly splits the prize equally.",
  organizer_selected: (r) => `The company picks up to ${r.reward.winnersCount} winner(s) using the published judging criteria. Winners split the prize equally.`,
};

export function RewardExplainer({ rules, decimals, symbol }: { rules: CampaignRules; decimals: number; symbol: string }) {
  if (rules.fundingSource === "none") {
    return (
      <div className="rounded-lg border border-line bg-paper px-4 py-3 text-sm">
        <p className="font-semibold">No token rewards</p>
        <p className="mt-0.5 text-ink-2">Just for fun — no token prize.</p>
      </div>
    );
  }
  const source = "A fixed prize the company deposited in the vault before the mission started.";
  return (
    <div className="space-y-2 rounded-lg border border-line bg-paper px-4 py-3 text-sm">
      <p className="font-semibold">How rewards work</p>
      <p className="text-ink-2">{MODE_COPY[rules.reward.mode]?.(rules)}</p>
      <p className="text-ink-2">{source}</p>
      <p className="text-[12.5px] text-ink-3">
        Rewards are paid in {symbol} on NEAR to a wallet you've verified. A reward is only claimable once its amount is finalized and the funds are locked in the vault
        contract. Unclaimed rewards expire after {rules.claimWindowDays} days.
      </p>
      {void decimals}
    </div>
  );
}

export function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}
