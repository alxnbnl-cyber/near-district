import { z } from "zod";
import { estimateCampaignEconomics, formatDisplay, parseUnits } from "@yielvy/core";
import { utilizationBps } from "@yielvy/near";
import { badRequest, route } from "@/server/http";
import { oneClick, rhea, token } from "@/server/near";
import { rateLimit } from "@/server/rate-limit";
import { db } from "@/server/db";
import { ipHash } from "@/server/crypto";
import { clientIp } from "@/server/session";

/**
 * Operator gas per reward period: harvest + reconcile + commit + reserve + finalize + close,
 * measured conservatively as 0.03 NEAR including period storage. Converted at an indicative
 * NEAR/USD price from 1Click's public token list. Estimate only.
 */
const SETTLEMENT_NEAR_PER_PERIOD = 0.03;
const PLATFORM_FEE_BPS = 1000; // must match the vault's fee_bps once deployed
const SAFETY_BUFFER_BPS = 50;

let priceCache: { at: number; nearUsd: number } | null = null;
async function nearUsd(): Promise<number> {
  if (priceCache && Date.now() - priceCache.at < 300_000) return priceCache.nearUsd;
  const tokens = await oneClick().tokens();
  const p = tokens.find((t) => t.assetId === "nep141:wrap.near")?.price;
  if (!p || !Number.isFinite(p) || p <= 0) throw new Error("NEAR price unavailable");
  priceCache = { at: Date.now(), nearUsd: p };
  return p;
}

const q = z.object({
  principal: z.string().max(30),
  days: z.coerce.number().int().min(1).max(730),
  periods: z.coerce.number().int().min(1).max(365),
  winners: z.coerce.number().int().min(1).max(10_000),
  minPayout: z.string().max(30).default("0"),
  budget: z.string().max(30).default("0"),
});

export const GET = route(async (req) => {
  const p = q.parse(Object.fromEntries(req.nextUrl.searchParams));
  await rateLimit(await db(), `econ:${ipHash(await clientIp()) ?? "x"}`, 120, 60);
  const t = token();
  let principal: bigint, minPayout: bigint, budget: bigint;
  try {
    principal = parseUnits(p.principal || "0", t.decimals);
    minPayout = parseUnits(p.minPayout || "0", t.decimals);
    budget = parseUnits(p.budget || "0", t.decimals);
  } catch {
    throw badRequest(`Amounts must be ${t.symbol} values with at most ${t.decimals} decimals.`);
  }
  const [asset, price] = await Promise.all([rhea().getAsset(t), nearUsd()]);
  // USDC ≈ USD for this indicative conversion only.
  const settlementCost = BigInt(Math.ceil(SETTLEMENT_NEAR_PER_PERIOD * price * 10 ** t.decimals));
  const r = estimateCampaignEconomics({
    principal,
    tokenDecimals: t.decimals,
    observedSupplyApr: asset.supplyApr,
    durationSeconds: BigInt(p.days) * 86_400n,
    periods: p.periods,
    platformFeeBps: PLATFORM_FEE_BPS,
    safetyBufferBps: SAFETY_BUFFER_BPS,
    settlementCostPerPeriod: settlementCost,
    crossChainFee: 0n,
    directRewardBudget: budget,
    minPayout,
    winnersPerPeriod: p.winners,
  });
  const f = (x: bigint) => formatDisplay(x, t.decimals, x > 0n && x < 10n ** BigInt(t.decimals - 2) ? 4 : 2);
  return {
    observedSupplyApr: asset.supplyApr,
    utilizationBps: utilizationBps(asset),
    ...r,
    breakEvenDays: r.breakEvenSeconds === null ? null : Math.ceil(Number(r.breakEvenSeconds) / 86_400),
    formatted: {
      grossYield: f(r.grossYield),
      yieldPerDay: f(r.yieldPerDay),
      rewardPerWinnerPerPeriod: f(r.rewardPerWinnerPerPeriod),
      rewardPerPeriod: f(r.rewardPerPeriod),
      settlementCosts: f(r.settlementCosts),
    },
    assumptions: [
      `Simple interest at today's rate; the real rate moves with borrowing demand.`,
      `${PLATFORM_FEE_BPS / 100}% platform fee on collected interest only (never on principal or budget).`,
      `About ${SETTLEMENT_NEAR_PER_PERIOD} NEAR of network fees per reward period (≈ ${f(settlementCost)} ${t.symbol} at $${price.toFixed(2)}/NEAR).`,
      `Winners pay their own small claim fee in NEAR.`,
    ],
  };
});
