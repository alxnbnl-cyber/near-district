/**
 * Campaign economics. Everything here is an ESTIMATE shown to organizers before they
 * fund; nothing in this file is ever used to pay anyone. Payouts use only realized,
 * verified on-chain balances.
 *
 * Simple (non-compounding) interest is used deliberately: RHEA accrues continuously,
 * so the simple figure slightly UNDER-states yield, which is the safe direction.
 */
import { bpsOf, mulDivFloor, parseFixed, type Amount } from "./money";

const APR_SCALE = 18;
const ONE = 10n ** BigInt(APR_SCALE);
const SECONDS_PER_YEAR = 365n * 24n * 3600n;

export interface EconomicsInput {
  principal: Amount; // token units
  tokenDecimals: number;
  /** Observed supply APR from RHEA get_asset().supply_apr, e.g. "0.0896". */
  observedSupplyApr: string;
  durationSeconds: bigint;
  /** Number of reward periods over the duration (each needs a yield settlement). */
  periods: number;
  /** Platform fee on realized yield, basis points. */
  platformFeeBps: number;
  /** Safety buffer of principal value left un-harvested, basis points. */
  safetyBufferBps: number;
  /** Estimated operator cost per settlement in token units (gas converted at an indicative price). */
  settlementCostPerPeriod: Amount;
  /** One-off cross-chain funding fee in token units (from a real 1Click quote), if any. */
  crossChainFee: Amount;
  directRewardBudget: Amount;
  minPayout: Amount;
  winnersPerPeriod: number;
}

export interface EconomicsResult {
  grossYield: Amount;
  platformFee: Amount;
  settlementCosts: Amount;
  netYieldForRewards: Amount;
  netYieldPerPeriod: Amount;
  directBudgetPerPeriod: Amount;
  rewardPerPeriod: Amount;
  rewardPerWinnerPerPeriod: Amount;
  yieldPerDay: Amount;
  /** Smallest duration (seconds) for which one period's net yield covers its settlement cost. */
  breakEvenSeconds: bigint | null;
  warnings: string[];
  viable: boolean;
}

export function estimateGrossYield(principal: Amount, apr: string, seconds: bigint): Amount {
  const aprFixed = parseFixed(apr, APR_SCALE);
  return mulDivFloor(principal * aprFixed, seconds, ONE * SECONDS_PER_YEAR);
}

export function estimateCampaignEconomics(i: EconomicsInput): EconomicsResult {
  const warnings: string[] = [];
  if (i.periods < 1) throw new Error("At least one reward period is required");
  const periods = BigInt(i.periods);
  const gross = estimateGrossYield(i.principal, i.observedSupplyApr, i.durationSeconds);
  const harvestable = gross; // buffer applies to principal value, not to yield itself
  const platformFee = bpsOf(harvestable, i.platformFeeBps);
  const settlementCosts = i.settlementCostPerPeriod * periods;
  const afterFees = harvestable - platformFee;
  const net = afterFees > settlementCosts ? afterFees - settlementCosts : 0n;
  const netPerPeriod = net / periods;
  const directPerPeriod = i.directRewardBudget / periods;
  const rewardPerPeriod = netPerPeriod + directPerPeriod;
  const winners = BigInt(Math.max(1, i.winnersPerPeriod));
  const perWinner = rewardPerPeriod / winners;
  const yieldPerDay = estimateGrossYield(i.principal, i.observedSupplyApr, 86_400n);

  // Break-even: seconds per period such that period yield*(1-fee) >= settlement cost.
  let breakEvenSeconds: bigint | null = null;
  const aprFixed = parseFixed(i.observedSupplyApr, APR_SCALE);
  const feeKeep = 10_000n - BigInt(i.platformFeeBps);
  if (i.principal > 0n && aprFixed > 0n && feeKeep > 0n) {
    // cost <= principal*apr*s/year * keep/10000  =>  s >= cost*year*10000*ONE / (principal*apr*keep)
    const num = i.settlementCostPerPeriod * SECONDS_PER_YEAR * 10_000n * ONE;
    const den = i.principal * aprFixed * feeKeep;
    breakEvenSeconds = num === 0n ? 0n : (num - 1n) / den + 1n;
  }

  if (i.principal > 0n && aprFixed === 0n) warnings.push("The lending market currently reports a 0% supply rate.");
  if (i.principal > 0n && afterFees <= settlementCosts) {
    warnings.push("Expected yield does not cover the estimated settlement costs. Yield-funded rewards would be zero.");
  }
  if (rewardPerPeriod > 0n && perWinner < i.minPayout) {
    warnings.push("Each winner's estimated reward is below the minimum payout threshold.");
  }
  if (i.principal === 0n && i.directRewardBudget === 0n) warnings.push("The campaign has no funding source.");
  if (i.crossChainFee > 0n && i.crossChainFee * 10n > i.principal + i.directRewardBudget) {
    warnings.push("The cross-chain fee is more than 10% of the amount being funded.");
  }
  if (i.safetyBufferBps > 0 && i.principal > 0n) {
    // informational only — buffer means a slice of yield stays in the position as loss protection
  }
  const viable = rewardPerPeriod > 0n && perWinner >= i.minPayout;
  return {
    grossYield: gross,
    platformFee,
    settlementCosts,
    netYieldForRewards: net,
    netYieldPerPeriod: netPerPeriod,
    directBudgetPerPeriod: directPerPeriod,
    rewardPerPeriod,
    rewardPerWinnerPerPeriod: perWinner,
    yieldPerDay,
    breakEvenSeconds,
    warnings,
    viable,
  };
}
