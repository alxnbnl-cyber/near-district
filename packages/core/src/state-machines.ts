/**
 * Explicit state machines for every financial workflow. The database stores the
 * state; every update goes through `assertTransition` so an illegal jump (e.g.
 * marking a funding order SUPPLIED without passing RECEIVED) is impossible in code.
 */

function machine<S extends string>(edges: Record<S, readonly S[]>, terminal: readonly S[]) {
  return {
    edges,
    terminal,
    can(from: S, to: S): boolean {
      return edges[from].includes(to);
    },
    assert(from: S, to: S): void {
      if (!edges[from].includes(to)) throw new IllegalTransitionError(String(from), String(to));
    },
  };
}

export class IllegalTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Illegal state transition ${from} -> ${to}`);
  }
}

export const FUNDING_STATES = [
  "CREATED",
  "QUOTED",
  "AWAITING_PAYMENT",
  "DETECTED",
  "SETTLING",
  "RECEIVED",
  "SUPPLY_PENDING",
  "SUPPLIED",
  "EXPIRED",
  "INCOMPLETE",
  "REFUNDED",
  "FAILED",
  "REQUIRES_REVIEW",
] as const;
export type FundingState = (typeof FUNDING_STATES)[number];

const FAIL = ["FAILED", "REQUIRES_REVIEW"] as const;

export const fundingMachine = machine<FundingState>(
  {
    CREATED: ["QUOTED", "AWAITING_PAYMENT", ...FAIL],
    QUOTED: ["AWAITING_PAYMENT", "EXPIRED", ...FAIL],
    AWAITING_PAYMENT: ["DETECTED", "RECEIVED", "EXPIRED", ...FAIL],
    DETECTED: ["SETTLING", "INCOMPLETE", "REFUNDED", ...FAIL],
    SETTLING: ["RECEIVED", "INCOMPLETE", "REFUNDED", ...FAIL],
    RECEIVED: ["SUPPLY_PENDING", "SUPPLIED", ...FAIL],
    SUPPLY_PENDING: ["SUPPLIED", "RECEIVED", ...FAIL],
    SUPPLIED: [],
    EXPIRED: [],
    INCOMPLETE: ["REFUNDED", "SETTLING", "REQUIRES_REVIEW"],
    REFUNDED: [],
    FAILED: ["REQUIRES_REVIEW"],
    REQUIRES_REVIEW: ["RECEIVED", "REFUNDED", "FAILED"],
  },
  ["SUPPLIED", "EXPIRED", "REFUNDED"],
);

export const REWARD_PERIOD_STATES = [
  "SCHEDULED",
  "ELIGIBILITY_FROZEN",
  "YIELD_SETTLEMENT_PENDING",
  "FUNDS_RESERVED",
  "WINNERS_FINALIZED",
  "CLAIMABLE",
  "COMPLETED",
  "VETOED",
  "NO_WINNERS",
  "REQUIRES_REVIEW",
] as const;
export type RewardPeriodState = (typeof REWARD_PERIOD_STATES)[number];

export const rewardPeriodMachine = machine<RewardPeriodState>(
  {
    SCHEDULED: ["ELIGIBILITY_FROZEN", "NO_WINNERS", "REQUIRES_REVIEW"],
    ELIGIBILITY_FROZEN: ["YIELD_SETTLEMENT_PENDING", "FUNDS_RESERVED", "NO_WINNERS", "REQUIRES_REVIEW"],
    YIELD_SETTLEMENT_PENDING: ["FUNDS_RESERVED", "YIELD_SETTLEMENT_PENDING", "NO_WINNERS", "REQUIRES_REVIEW"],
    FUNDS_RESERVED: ["WINNERS_FINALIZED", "NO_WINNERS", "REQUIRES_REVIEW"],
    WINNERS_FINALIZED: ["CLAIMABLE", "VETOED", "REQUIRES_REVIEW"],
    CLAIMABLE: ["COMPLETED", "REQUIRES_REVIEW"],
    COMPLETED: [],
    VETOED: ["FUNDS_RESERVED"],
    NO_WINNERS: [],
    REQUIRES_REVIEW: ["ELIGIBILITY_FROZEN", "FUNDS_RESERVED", "WINNERS_FINALIZED", "NO_WINNERS"],
  },
  ["COMPLETED", "NO_WINNERS"],
);

export const WITHDRAWAL_STATES = [
  "REQUESTED",
  "VALIDATING",
  "REDEMPTION_PENDING",
  "REDEEMED",
  "TRANSFER_PENDING",
  "CONFIRMED",
  "LIQUIDITY_WAIT",
  "REJECTED",
  "FAILED",
  "REQUIRES_REVIEW",
] as const;
export type WithdrawalState = (typeof WITHDRAWAL_STATES)[number];

export const withdrawalMachine = machine<WithdrawalState>(
  {
    REQUESTED: ["VALIDATING", "REJECTED"],
    VALIDATING: ["REDEMPTION_PENDING", "TRANSFER_PENDING", "REJECTED", ...FAIL],
    REDEMPTION_PENDING: ["REDEEMED", "LIQUIDITY_WAIT", ...FAIL],
    LIQUIDITY_WAIT: ["REDEMPTION_PENDING", ...FAIL],
    REDEEMED: ["TRANSFER_PENDING", ...FAIL],
    TRANSFER_PENDING: ["CONFIRMED", ...FAIL],
    CONFIRMED: [],
    REJECTED: [],
    FAILED: ["REQUIRES_REVIEW", "VALIDATING"],
    REQUIRES_REVIEW: ["VALIDATING", "FAILED", "CONFIRMED"],
  },
  ["CONFIRMED", "REJECTED"],
);

export const CLAIM_STATES = ["AVAILABLE", "SUBMITTED", "CONFIRMED", "FAILED", "EXPIRED"] as const;
export type ClaimState = (typeof CLAIM_STATES)[number];
export const claimMachine = machine<ClaimState>(
  {
    AVAILABLE: ["SUBMITTED", "EXPIRED"],
    SUBMITTED: ["CONFIRMED", "FAILED"],
    FAILED: ["SUBMITTED", "AVAILABLE", "EXPIRED"],
    CONFIRMED: [],
    EXPIRED: [],
  },
  ["CONFIRMED", "EXPIRED"],
);

export const CAMPAIGN_STATES = [
  "DRAFT",
  "PENDING_FUNDING",
  "SCHEDULED",
  "LIVE",
  "PAUSED",
  "ENDED",
  "AWAITING_RESULTS",
  "COMPLETED",
  "SUSPENDED",
] as const;
export type CampaignState = (typeof CAMPAIGN_STATES)[number];
export const campaignMachine = machine<CampaignState>(
  {
    DRAFT: ["PENDING_FUNDING", "SCHEDULED", "LIVE"],
    PENDING_FUNDING: ["DRAFT", "SCHEDULED", "LIVE"],
    SCHEDULED: ["LIVE", "PAUSED", "SUSPENDED"],
    LIVE: ["PAUSED", "ENDED", "SUSPENDED"],
    PAUSED: ["LIVE", "ENDED", "SUSPENDED"],
    ENDED: ["AWAITING_RESULTS", "COMPLETED"],
    AWAITING_RESULTS: ["COMPLETED"],
    COMPLETED: [],
    SUSPENDED: ["PAUSED", "ENDED"],
  },
  ["COMPLETED"],
);
