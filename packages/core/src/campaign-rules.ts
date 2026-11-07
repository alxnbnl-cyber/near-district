/**
 * Published campaign rules are versioned. Once anyone has joined, a change that
 * could hurt participants ("material") is blocked; changes that only help them
 * (extending the end date, adding reward budget) are allowed with a notice.
 */
import type { RewardConfig } from "./rewards";

export interface JudgingCriterion {
  key: string;
  label: string;
  weightBps: number;
}

export interface CampaignRules {
  template: "treasure_hunt" | "creative_contest";
  startsAt: string; // ISO
  endsAt: string; // ISO
  eligibility: {
    requireVerifiedPayout: boolean;
    maxParticipants?: number;
    blockedJurisdictions: string[];
  };
  reward: Omit<RewardConfig, "perPersonCap" | "minPayout"> & { perPersonCap?: string; minPayout: string };
  /** "none" = no token rewards (clearly labelled); otherwise funded through the vault. */
  fundingSource: "none" | "yield" | "direct" | "both";
  periods: number;
  judgingCriteria?: JudgingCriterion[];
  questionCount?: number;
  claimWindowDays: number;
  /** Planned direct reward budget (token units, integer string); publishing verifies it on-chain. */
  plannedDirectBudget?: string;
}

export type ChangeKind = "material" | "beneficial" | "cosmetic";

export interface RuleChange {
  field: string;
  kind: ChangeKind;
  description: string;
}

export function diffRules(prev: CampaignRules, next: CampaignRules): RuleChange[] {
  const out: RuleChange[] = [];
  const add = (field: string, kind: ChangeKind, description: string) => out.push({ field, kind, description });
  if (prev.template !== next.template) add("template", "material", "Template changed");
  if (prev.startsAt !== next.startsAt) add("startsAt", "material", "Start date changed");
  if (prev.endsAt !== next.endsAt) {
    add("endsAt", Date.parse(next.endsAt) > Date.parse(prev.endsAt) ? "beneficial" : "material", "End date changed");
  }
  if (JSON.stringify(prev.eligibility) !== JSON.stringify(next.eligibility)) add("eligibility", "material", "Eligibility changed");
  const r0 = prev.reward;
  const r1 = next.reward;
  if (r0.mode !== r1.mode) add("reward.mode", "material", "Reward mechanism changed");
  if (r0.winnersCount !== r1.winnersCount) {
    add("reward.winnersCount", r1.winnersCount > r0.winnersCount ? "beneficial" : "material", "Number of winners changed");
  }
  if (JSON.stringify(r0.rankSharesBps ?? null) !== JSON.stringify(r1.rankSharesBps ?? null)) add("reward.rankSharesBps", "material", "Prize split changed");
  if (r0.tieBreak !== r1.tieBreak) add("reward.tieBreak", "material", "Tie-break rule changed");
  if (r0.perPersonCap !== r1.perPersonCap) add("reward.perPersonCap", "material", "Per-person cap changed");
  if (r0.minPayout !== r1.minPayout) add("reward.minPayout", "material", "Minimum payout changed");
  if (r0.maxQualified !== r1.maxQualified) add("reward.maxQualified", "material", "Qualified participant limit changed");
  if (prev.fundingSource !== next.fundingSource) add("fundingSource", "material", "Funding source changed");
  if (prev.periods !== next.periods) add("periods", "material", "Reward schedule changed");
  if (JSON.stringify(prev.judgingCriteria ?? null) !== JSON.stringify(next.judgingCriteria ?? null)) {
    add("judgingCriteria", "material", "Judging criteria changed");
  }
  if (prev.questionCount !== next.questionCount) add("questionCount", "material", "Number of questions changed");
  if (prev.claimWindowDays !== next.claimWindowDays) {
    add("claimWindowDays", next.claimWindowDays > prev.claimWindowDays ? "beneficial" : "material", "Claim window changed");
  }
  return out;
}

export type ChangeDecision =
  | { allowed: true; requiresNotice: boolean; changes: RuleChange[] }
  | { allowed: false; reason: string; changes: RuleChange[] };

export function evaluateRuleChange(prev: CampaignRules, next: CampaignRules, participantCount: number, afterDeadline: boolean): ChangeDecision {
  const changes = diffRules(prev, next);
  if (changes.length === 0) return { allowed: true, requiresNotice: false, changes };
  if (afterDeadline && changes.some((c) => c.kind !== "cosmetic")) {
    return { allowed: false, reason: "Rules cannot change after the campaign deadline.", changes };
  }
  const material = changes.filter((c) => c.kind === "material");
  if (participantCount > 0 && material.length > 0) {
    return {
      allowed: false,
      reason: `Participants have already joined. These changes could disadvantage them: ${material.map((c) => c.description).join(", ")}.`,
      changes,
    };
  }
  return { allowed: true, requiresNotice: participantCount > 0, changes };
}

export function validateCriteria(c: JudgingCriterion[]): string[] {
  const errs: string[] = [];
  if (c.length === 0) errs.push("Add at least one judging criterion");
  if (c.length > 8) errs.push("At most 8 judging criteria");
  const keys = new Set(c.map((x) => x.key));
  if (keys.size !== c.length) errs.push("Criterion keys must be unique");
  if (c.some((x) => !Number.isInteger(x.weightBps) || x.weightBps <= 0)) errs.push("Each weight must be a positive whole number");
  if (c.reduce((a, b) => a + b.weightBps, 0) !== 10_000) errs.push("Weights must add up to 100%");
  return errs;
}

/**
 * Weighted score in hundredths (e.g. 815 = 8.15/10). Scores per criterion are integers 0..10.
 * Integer arithmetic only, so every reviewer sees the identical result.
 */
export function weightedScore(criteria: JudgingCriterion[], scores: Record<string, number>): number {
  let total = 0;
  for (const c of criteria) {
    const s = scores[c.key];
    if (s === undefined || !Number.isInteger(s) || s < 0 || s > 10) throw new Error(`Score for ${c.label} must be 0-10`);
    total += s * c.weightBps;
  }
  return Math.floor(total / 100);
}
