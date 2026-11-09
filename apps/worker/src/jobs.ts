import {
  and,
  campaigns,
  campaignVersions,
  chainTransactions,
  eq,
  fundingOrders,
  inArray,
  isNotNull,
  ledgerEntries,
  lt,
  notifications,
  reconciliationRuns,
  rewardAllocations,
  rewardClaims,
  rewardPeriods,
  vaultPositions,
  adminRoles,
  type Db,
} from "@yielvy/db";
import { campaignMachine, fundingMachine, type CampaignRules, type CampaignState, type FundingState } from "@yielvy/core";
import { ledgerMovesForEvent, mapIntentsStatus, sharesToTokens, type NearRpc, type OneClickClient, type RheaClient, type VaultClient, type VaultEvent } from "@yielvy/near";
import type { AllowedToken } from "@yielvy/core";
import { duePendingVerifications, processVerification, type EngineDeps } from "@yielvy/db";
import { NearActivityVerifier } from "@yielvy/near";
import { enqueue, RetryLater } from "./queue";
import { processPeriod } from "./rewards";
import type { OperatorSigner } from "./operator";

export interface JobCtx {
  db: Db;
  rpc: NearRpc;
  vault: VaultClient | null;
  rhea: RheaClient;
  oneClick: OneClickClient;
  signer: OperatorSigner | null;
  token: AllowedToken;
  network: string;
}

export async function rulesFor(db: Db, c: typeof campaigns.$inferSelect): Promise<CampaignRules> {
  const [v] = await db
    .select({ rules: campaignVersions.rules })
    .from(campaignVersions)
    .where(and(eq(campaignVersions.campaignId, c.id), eq(campaignVersions.version, c.currentVersion ?? 0)))
    .limit(1);
  if (!v) throw new Error(`campaign ${c.id} has no published rules`);
  return v.rules as CampaignRules;
}

/** Moves campaigns between SCHEDULED → LIVE → ENDED as their dates pass. */
export async function campaignTick(ctx: JobCtx): Promise<string> {
  const now = new Date();
  const rows = await ctx.db.select().from(campaigns).where(inArray(campaigns.status, ["SCHEDULED", "LIVE"]));
  let moved = 0;
  for (const c of rows) {
    let to: CampaignState | null = null;
    if (c.status === "SCHEDULED" && c.startsAt && c.startsAt <= now) to = "LIVE";
    if ((c.status === "LIVE" || to === "LIVE") && c.endsAt && c.endsAt <= now) to = c.status === "SCHEDULED" ? "LIVE" : "ENDED";
    if (!to) continue;
    campaignMachine.assert(c.status as CampaignState, to);
    await ctx.db.update(campaigns).set({ status: to, updatedAt: now }).where(and(eq(campaigns.id, c.id), eq(campaigns.status, c.status)));
    moved++;
  }
  // every funded period that may need work gets a driver job
  const periods = await ctx.db
    .select({ id: rewardPeriods.id })
    .from(rewardPeriods)
    .where(inArray(rewardPeriods.state, ["SCHEDULED", "ELIGIBILITY_FROZEN", "YIELD_SETTLEMENT_PENDING", "FUNDS_RESERVED", "WINNERS_FINALIZED", "CLAIMABLE"]));
  const bucket = Math.floor(Date.now() / 60_000);
  for (const p of periods) await enqueue(ctx.db, "rewards.period", { periodId: p.id }, { idempotencyKey: `rewards.period:${p.id}:${bucket}` });
  return `moved ${moved}, ${periods.length} periods queued`;
}

export async function rewardsPeriod(ctx: JobCtx, payload: { periodId: string }): Promise<string> {
  return processPeriod({ db: ctx.db, vault: ctx.vault, signer: ctx.signer, network: ctx.network, rulesFor: (c) => rulesFor(ctx.db, c) }, payload.periodId);
}

/**
 * Tracks 1Click deposits. SUCCESS is only accepted after the organizer's NEAR balance of the
 * allowlisted token is at least the reported amountOut; the vault deposit itself is a separate,
 * signed, on-chain-verified step.
 */
export async function intentsPoll(ctx: JobCtx): Promise<string> {
  const open = await ctx.db
    .select()
    .from(fundingOrders)
    .where(and(eq(fundingOrders.route, "intents"), inArray(fundingOrders.state, ["QUOTED", "AWAITING_PAYMENT", "DETECTED", "SETTLING", "INCOMPLETE"]), isNotNull(fundingOrders.intentsDepositAddress)));
  let updated = 0;
  for (const o of open) {
    let st;
    try {
      st = await ctx.oneClick.status(o.intentsDepositAddress!);
    } catch (e) {
      continue; // transient; next poll
    }
    const t = mapIntentsStatus(st);
    const from = o.state as FundingState;
    let next: FundingState | null = null;
    let reason: string | null = null;
    if (!t) continue;
    if (t.to === "BRIDGED") {
      const bal = BigInt(await ctx.rpc.view<string>(ctx.token.contractId, "ft_balance_of", { account_id: o.sponsorAccountId }));
      if (bal < t.amountOut) {
        next = "REQUIRES_REVIEW";
        reason = "1Click reported success but the organizer's balance is lower than the delivered amount";
      } else {
        next = "RECEIVED";
      }
    } else if (t.to !== from) {
      next = t.to;
      reason = t.reason ?? null;
    }
    if (from === "QUOTED" && next === "AWAITING_PAYMENT") next = "AWAITING_PAYMENT";
    if (!next || next === from) {
      if (o.expiresAt && o.expiresAt < new Date() && (from === "QUOTED" || from === "AWAITING_PAYMENT")) next = "EXPIRED";
      else continue;
    }
    if (!fundingMachine.can(from, next)) next = fundingMachine.can(from, "REQUIRES_REVIEW") ? "REQUIRES_REVIEW" : null;
    if (!next) continue;
    await ctx.db
      .update(fundingOrders)
      .set({ state: next, intentsStatus: st.status, failureReason: reason, originTxHash: st.swapDetails?.originChainTxHashes?.[0]?.hash ?? o.originTxHash, updatedAt: new Date() })
      .where(eq(fundingOrders.id, o.id));
    await ctx.db
      .insert(notifications)
      .values({
        userId: o.organizerUserId,
        kind: "funding",
        title: next === "RECEIVED" ? "Bridged funds arrived" : `Cross-chain funding: ${next.toLowerCase().replace("_", " ")}`,
        body: next === "RECEIVED" ? "USDC landed in your NEAR wallet. Deposit it into your campaign to finish funding." : (reason ?? "Status changed."),
        link: "/organizer/funding",
        dedupeKey: `funding:${o.id}:${next}`,
      })
      .onConflictDoNothing();
    updated++;
  }
  return `${open.length} open, ${updated} updated`;
}

/** Compares the vault's books against the token contract and RHEA, and records the result. */
export async function vaultReconcile(ctx: JobCtx): Promise<string> {
  if (!ctx.vault) return "no vault";
  const [run] = await ctx.db.insert(reconciliationRuns).values({ status: "running" }).returning();
  const issues: { kind: string; detail: string }[] = [];
  try {
    const [totals, inv, balance, rheaShares] = await Promise.all([
      ctx.vault.totals(),
      ctx.vault.invariants(),
      ctx.rpc.view<string>(ctx.token.contractId, "ft_balance_of", { account_id: ctx.vault.contractId }),
      ctx.rhea.getSuppliedShares(ctx.vault.contractId, ctx.token.contractId),
    ]);
    if (!inv.ok) issues.push({ kind: "invariant", detail: `liquid ${inv.liquid_sum}/${inv.liquid_tracked}, shares ${inv.shares_sum}/${inv.total_rhea_shares}` });
    if (BigInt(balance) < BigInt(totals.liquid_tracked)) issues.push({ kind: "token_shortfall", detail: `token balance ${balance} < tracked ${totals.liquid_tracked}` });
    if (!totals.pending_op && rheaShares !== BigInt(totals.total_rhea_shares)) issues.push({ kind: "rhea_shares", detail: `RHEA reports ${rheaShares}, vault tracks ${totals.total_rhea_shares}` });
    if (totals.pending_op && Date.now() - Number(BigInt(totals.pending_op.started_at) / 1_000_000n) > 3_600_000) issues.push({ kind: "stuck_op", detail: `op ${totals.pending_op.op_id} pending > 1h` });
    await ctx.db
      .update(reconciliationRuns)
      .set({ status: issues.length ? "discrepancy" : "ok", finishedAt: new Date(), vaultTokenBalance: BigInt(balance), vaultLiquidTracked: BigInt(totals.liquid_tracked), vaultRheaShares: BigInt(totals.total_rhea_shares), rheaReportedShares: rheaShares, discrepancies: issues })
      .where(eq(reconciliationRuns.id, run!.id));
    if (issues.length) {
      const admins = await ctx.db.select({ userId: adminRoles.userId }).from(adminRoles).where(inArray(adminRoles.role, ["superadmin", "finance"]));
      for (const a of admins) {
        await ctx.db
          .insert(notifications)
          .values({ userId: a.userId, kind: "reconciliation", title: "Vault reconciliation discrepancy", body: issues.map((i) => i.kind).join(", "), link: "/admin", dedupeKey: `recon:${run!.id}` })
          .onConflictDoNothing();
      }
    }
    return issues.length ? `DISCREPANCY ${issues.map((i) => i.kind).join(",")}` : "ok";
  } catch (e) {
    await ctx.db.update(reconciliationRuns).set({ status: "error", finishedAt: new Date(), discrepancies: [{ kind: "error", detail: String(e) }] }).where(eq(reconciliationRuns.id, run!.id));
    throw e;
  }
}

/** Append-only snapshots of each campaign's on-chain position for history charts. */
export async function vaultSnapshot(ctx: JobCtx): Promise<string> {
  if (!ctx.vault) return "no vault";
  const rows = await ctx.db.select({ id: campaigns.id, vid: campaigns.vaultCampaignId }).from(campaigns).where(isNotNull(campaigns.vaultCampaignId));
  if (rows.length === 0) return "none";
  const asset = await ctx.rhea.getAsset(ctx.token);
  const height = BigInt(await ctx.rpc.finalBlockHeight());
  for (const r of rows) {
    const c = await ctx.vault.campaign(r.vid!);
    if (!c) continue;
    await ctx.db.insert(vaultPositions).values({
      campaignId: r.id,
      blockHeight: height,
      principalIdle: BigInt(c.principal_idle),
      principalSupplied: BigInt(c.principal_supplied),
      rheaShares: BigInt(c.rhea_shares),
      positionValue: sharesToTokens(BigInt(c.rhea_shares), asset),
      yieldAvailable: BigInt(c.yield_available),
      bonusAvailable: BigInt(c.bonus_available),
      reserved: BigInt(c.reserved),
      claimedTotal: BigInt(c.claimed_total),
      observedSupplyApr: asset.supplyApr,
    });
  }
  return `${rows.length} snapshots`;
}

/** Turns verified vault events into append-only ledger rows (idempotent by event ref). */
export async function indexLedger(ctx: JobCtx): Promise<string> {
  const txs = await ctx.db.select().from(chainTransactions).where(eq(chainTransactions.status, "success")).limit(500);
  let rows = 0;
  for (const t of txs) {
    for (const [i, ev] of (t.events as VaultEvent[]).entries()) {
      const vid = ev.data.campaign_id;
      const [c] = vid ? await ctx.db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.vaultCampaignId, BigInt(vid))).limit(1) : [];
      for (const m of ledgerMovesForEvent(ev)) {
        const res = await ctx.db
          .insert(ledgerEntries)
          .values({ campaignId: c?.id ?? null, bucket: m.bucket as "fees", delta: m.delta, eventType: ev.event, eventRef: `${t.txHash}:${i}:${m.bucket}`, txHash: t.txHash, blockHeight: t.blockHeight })
          .onConflictDoNothing()
          .returning({ id: ledgerEntries.id });
        rows += res.length;
      }
    }
  }
  return `${rows} ledger rows`;
}

/** Confirms claims whose tx the client never reported back, straight from vault state. */
export async function claimsReconcile(ctx: JobCtx): Promise<string> {
  if (!ctx.vault) return "no vault";
  const pending = await ctx.db
    .select({ claim: rewardClaims, a: rewardAllocations, p: rewardPeriods, vid: campaigns.vaultCampaignId })
    .from(rewardClaims)
    .innerJoin(rewardAllocations, eq(rewardAllocations.id, rewardClaims.allocationId))
    .innerJoin(rewardPeriods, eq(rewardPeriods.id, rewardAllocations.rewardPeriodId))
    .innerJoin(campaigns, eq(campaigns.id, rewardPeriods.campaignId))
    .where(and(inArray(rewardClaims.state, ["AVAILABLE", "SUBMITTED", "FAILED"]), inArray(rewardPeriods.state, ["CLAIMABLE", "COMPLETED"])))
    .limit(200);
  let confirmed = 0;
  for (const r of pending) {
    if (r.vid === null) continue;
    if (await ctx.vault.isClaimed(r.vid, r.p.periodNumber, r.a.accountId)) {
      await ctx.db.update(rewardClaims).set({ state: "CONFIRMED", confirmedAt: new Date(), updatedAt: new Date() }).where(eq(rewardClaims.id, r.claim.id));
      confirmed++;
    } else if (r.p.claimDeadline && r.p.claimDeadline < new Date()) {
      await ctx.db.update(rewardClaims).set({ state: "EXPIRED", updatedAt: new Date() }).where(eq(rewardClaims.id, r.claim.id));
    }
  }
  return `${confirmed} confirmed`;
}

export async function pruneRateLimits(ctx: JobCtx): Promise<string> {
  const { rateLimits } = await import("@yielvy/db");
  await ctx.db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(Date.now() - 86_400_000)));
  const { jobs } = await import("@yielvy/db");
  // keep finished jobs for a week of operational history; dead jobs stay until handled
  await ctx.db.delete(jobs).where(and(eq(jobs.status, "done"), lt(jobs.updatedAt, new Date(Date.now() - 7 * 86_400_000))));
  return "pruned";
}

/**
 * Re-runs pending hint verifications (finality, holding periods, RPC recovery). Uses the same engine as the
 * web app, so a pending activity is never marked complete until the chain evidence is final and valid.
 */
export function hintEngineDeps(ctx: JobCtx): EngineDeps {
  const mainnet = ctx.network === "mainnet";
  const v = mainnet ? new NearActivityVerifier(ctx.rpc) : null;
  return {
    walletNetwork: mainnet ? "mainnet" : "testnet",
    onchain: v
      ? {
          verify: (def, input) =>
            def.type === "near_rhea_swap" ? v.verifySwap(def, input) : def.type === "near_rhea_lending_supply" ? v.verifyLendingSupply(def, input) : Promise.resolve({ status: "failed" as const, reason: "unsupported_activity" }),
        }
      : null,
  };
}

export async function hintsReconcile(ctx: JobCtx): Promise<string> {
  const ids = await duePendingVerifications(ctx.db, new Date(), 25);
  const deps = hintEngineDeps(ctx);
  const tally: Record<string, number> = {};
  for (const id of ids) {
    const r = await processVerification(ctx.db, deps, id);
    tally[r.status] = (tally[r.status] ?? 0) + 1;
  }
  return ids.length ? JSON.stringify(tally) : "nothing due";
}

export const HANDLERS: Record<string, (ctx: JobCtx, payload: Record<string, unknown>) => Promise<string>> = {
  "campaign.tick": (c) => campaignTick(c),
  "rewards.period": (c, p) => rewardsPeriod(c, p as { periodId: string }),
  "intents.poll": (c) => intentsPoll(c),
  "vault.reconcile": (c) => vaultReconcile(c),
  "vault.snapshot": (c) => vaultSnapshot(c),
  "ledger.index": (c) => indexLedger(c),
  "claims.reconcile": (c) => claimsReconcile(c),
  "maintenance.prune": (c) => pruneRateLimits(c),
  "hints.reconcile": (c) => hintsReconcile(c),
};

/** Recurring schedule: [job, every N seconds]. Idempotency keys per time bucket prevent duplicates across replicas. */
export const SCHEDULE: [string, number][] = [
  ["campaign.tick", 60],
  ["intents.poll", 20],
  ["claims.reconcile", 120],
  ["ledger.index", 120],
  ["vault.reconcile", 600],
  ["vault.snapshot", 3600],
  ["maintenance.prune", 3600],
  ["hints.reconcile", 60],
];

export { RetryLater };
