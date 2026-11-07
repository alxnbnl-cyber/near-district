/**
 * Reward allocation. Pure functions over exact bigint amounts.
 * The allocated total is ALWAYS <= the reserved pool; any remainder (rounding dust,
 * caps, unfilled ranks) is returned to the campaign's unallocated balance.
 */
import { mulDivFloor, sum, type Amount } from "./money";
import { selectRandomWinners } from "./randomness";

export type RewardMode = "equal" | "top_scorers" | "organizer_selected" | "random_draw";
export type TieBreak = "earliest_completion" | "split";

export interface RewardConfig {
  mode: RewardMode;
  /** Winners per period (ignored for "equal"). */
  winnersCount: number;
  /**
   * Optional basis-point share per rank (rank 1 first). Must sum to <= 10000.
   * Omitted => equal split among winners.
   */
  rankSharesBps?: number[];
  perPersonCap?: Amount;
  minPayout: Amount;
  tieBreak: TieBreak;
  /** Max qualified participants considered (first-come by completion time). */
  maxQualified?: number;
}

export interface Candidate {
  accountId: string;
  /** Objective score (higher is better). Required for top_scorers. */
  score?: bigint;
  /** ms epoch of qualification; used for tie-breaks and maxQualified ordering. */
  completedAt: number;
}

export interface Allocation {
  accountId: string;
  amount: Amount;
  rank?: number;
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
  if (c.rankSharesBps) {
    if (c.rankSharesBps.some((b) => !Number.isInteger(b) || b < 0)) errors.push("Rank shares must be whole basis points");
    if (c.rankSharesBps.reduce((a, b) => a + b, 0) > 10_000) errors.push("Rank shares exceed 100%");
    if (c.mode !== "equal" && c.rankSharesBps.length > c.winnersCount) errors.push("More rank shares than winners");
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

/** Distribute `pool` over an ordered list of ranked groups (ties grouped together). */
function distributeRanked(pool: Amount, groups: string[][], c: RewardConfig): Allocation[] {
  const winners = c.winnersCount;
  const shares = c.rankSharesBps;
  const out: Allocation[] = [];
  let rank = 1;
  for (const group of groups) {
    if (rank > winners) break;
    const slots = Math.min(group.length, winners - rank + 1);
    // rank positions this group occupies: rank .. rank+group.length-1 (ties may exceed slots)
    let groupBps = 0n;
    let groupAmount = 0n;
    for (let r = rank; r < rank + slots; r++) {
      if (shares) groupBps += BigInt(shares[r - 1] ?? 0);
    }
    if (shares) groupAmount = mulDivFloor(pool, groupBps, 10_000n);
    else groupAmount = mulDivFloor(pool, BigInt(slots), BigInt(winners));
    const members = group.length > slots && c.tieBreak !== "split" ? group.slice(0, slots) : group;
    const each = groupAmount / BigInt(members.length);
    for (const accountId of members) out.push({ accountId, amount: each, rank });
    rank += group.length;
  }
  return out;
}

function limitQualified(cands: Candidate[], c: RewardConfig): Candidate[] {
  const ordered = [...cands].sort((a, b) => a.completedAt - b.completedAt || (a.accountId < b.accountId ? -1 : 1));
  return c.maxQualified ? ordered.slice(0, c.maxQualified) : ordered;
}

export function allocateRewards(
  pool: Amount,
  candidates: Candidate[],
  c: RewardConfig,
  opts: { randomSeedHex?: string; selectedAccountIds?: string[] } = {},
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

    case "top_scorers": {
      if (eligible.some((x) => x.score === undefined)) throw new Error("Top-scorer mode requires scores");
      const sorted = [...eligible].sort((a, b) => {
        if (a.score! !== b.score!) return a.score! > b.score! ? -1 : 1;
        if (c.tieBreak === "earliest_completion" && a.completedAt !== b.completedAt) return a.completedAt - b.completedAt;
        return a.accountId < b.accountId ? -1 : 1;
      });
      const groups: string[][] = [];
      for (const cand of sorted) {
        const last = groups[groups.length - 1];
        const prev = last ? sorted.find((s) => s.accountId === last[0]) : undefined;
        const tied =
          prev !== undefined &&
          prev.score === cand.score &&
          (c.tieBreak === "split" || prev.completedAt === cand.completedAt);
        if (tied && last) last.push(cand.accountId);
        else groups.push([cand.accountId]);
      }
      return capAndFilter(distributeRanked(pool, groups, c), pool, c);
    }

    case "organizer_selected": {
      const selected = opts.selectedAccountIds ?? [];
      const eligibleIds = new Set(eligible.map((x) => x.accountId));
      for (const s of selected) if (!eligibleIds.has(s)) throw new Error(`Selected winner ${s} is not eligible`);
      if (new Set(selected).size !== selected.length) throw new Error("Duplicate selected winner");
      if (selected.length > c.winnersCount) throw new Error("More winners selected than configured");
      return capAndFilter(distributeRanked(pool, selected.map((s) => [s]), c), pool, c);
    }

    case "random_draw": {
      if (!opts.randomSeedHex) throw new Error("Random draw requires the on-chain seed");
      const winners = selectRandomWinners(opts.randomSeedHex, eligible.map((x) => x.accountId), c.winnersCount);
      return capAndFilter(splitEqually(pool, winners), pool, c);
    }
  }
}
