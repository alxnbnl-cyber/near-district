/**
 * Reward allocation. Pure functions over exact bigint amounts.
 * The allocated total is ALWAYS <= the reserved pool; any remainder (rounding dust,
 * caps) is returned to the campaign's unallocated balance.
 */
import { sum, type Amount } from "./money";

/** NEAR District has one rule: an equal split. Hunts split among everyone correct; contests among the winners the company picks. */
export type RewardMode = "equal" | "organizer_selected";
export type TieBreak = "earliest_completion" | "split";

export interface RewardConfig {
  mode: RewardMode;
  /** Winners per period (ignored for "equal"). */
  winnersCount: number;
  perPersonCap?: Amount;
  minPayout: Amount;
  tieBreak: TieBreak;
  /** Max qualified participants considered (first-come by completion time). */
  maxQualified?: number;
}

export interface Candidate {
  accountId: string;
  /** Recorded score (kept in the eligibility snapshot; not used to split the prize). */
  score?: bigint;
  /** ms epoch of qualification; used for tie-breaks and maxQualified ordering. */
  completedAt: number;
}

export interface Allocation {
  accountId: string;
  amount: Amount;
}

export interface AllocationResult {
  allocations: Allocation[];
  allocatedTotal: Amount;
  remainder: Amount;
  /** Set when nothing could be allocated, with the honest reason. */
  blockedReason?: string;
}

export function validateRewardConfig(c: RewardConfig): string[] {
  const errors: string[] = [];
  if (c.mode !== "equal" && (!Number.isInteger(c.winnersCount) || c.winnersCount < 1 || c.winnersCount > 10_000)) {
    errors.push("Number of winners must be between 1 and 10,000");
  }
  if (c.minPayout < 0n) errors.push("Minimum payout cannot be negative");
  if (c.perPersonCap !== undefined && c.perPersonCap <= 0n) errors.push("Per-person cap must be positive");
  if (c.maxQualified !== undefined && (!Number.isInteger(c.maxQualified) || c.maxQualified < 1)) {
    errors.push("Max qualified participants must be a positive integer");
  }
  return errors;
}

function capAndFilter(raw: Allocation[], pool: Amount, c: RewardConfig): AllocationResult {
  const capped = raw.map((a) => ({
    ...a,
    amount: c.perPersonCap !== undefined && a.amount > c.perPersonCap ? c.perPersonCap : a.amount,
  }));
  const kept = capped.filter((a) => a.amount > 0n && a.amount >= c.minPayout);
  const allocatedTotal = sum(kept.map((a) => a.amount));
  if (allocatedTotal > pool) throw new Error("Invariant violated: allocation exceeds pool");
  if (kept.length === 0) {
    return {
      allocations: [],
      allocatedTotal: 0n,
      remainder: pool,
      blockedReason:
        raw.length === 0 ? "No eligible participants" : "Individual rewards would fall below the minimum payout threshold",
    };
  }
  return { allocations: kept, allocatedTotal, remainder: pool - allocatedTotal };
}

function splitEqually(pool: Amount, ids: string[]): Allocation[] {
  if (ids.length === 0) return [];
  const each = pool / BigInt(ids.length);
  return ids.map((accountId) => ({ accountId, amount: each }));
}

function limitQualified(cands: Candidate[], c: RewardConfig): Candidate[] {
  const ordered = [...cands].sort((a, b) => a.completedAt - b.completedAt || (a.accountId < b.accountId ? -1 : 1));
  return c.maxQualified ? ordered.slice(0, c.maxQualified) : ordered;
}

export function allocateRewards(
  pool: Amount,
  candidates: Candidate[],
  c: RewardConfig,
  opts: { selectedAccountIds?: string[] } = {},
): AllocationResult {
  if (pool < 0n) throw new Error("Pool cannot be negative");
  const errors = validateRewardConfig(c);
  if (errors.length) throw new Error(errors.join("; "));
  const ids = new Set<string>();
  for (const cand of candidates) {
    if (ids.has(cand.accountId)) throw new Error(`Duplicate candidate ${cand.accountId}`);
    ids.add(cand.accountId);
  }
  const eligible = limitQualified(candidates, c);
  if (pool === 0n) return { allocations: [], allocatedTotal: 0n, remainder: 0n, blockedReason: "Reward pool is empty" };

  switch (c.mode) {
    case "equal":
      return capAndFilter(splitEqually(pool, eligible.map((x) => x.accountId).sort()), pool, c);

    case "organizer_selected": {
      const selected = opts.selectedAccountIds ?? [];
      const eligibleIds = new Set(eligible.map((x) => x.accountId));
      for (const s of selected) if (!eligibleIds.has(s)) throw new Error(`Selected winner ${s} is not eligible`);
      if (new Set(selected).size !== selected.length) throw new Error("Duplicate selected winner");
      if (selected.length > c.winnersCount) throw new Error("More winners selected than configured");
      return capAndFilter(splitEqually(pool, [...selected].sort()), pool, c);
    }
  }
}
