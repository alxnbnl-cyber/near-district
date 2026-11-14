import {
  and,
  campaigns,
  campaignVersions,
  chainTransactions,
  eq,
  inArray,
  isNotNull,
  ledgerEntries,
  lt,
  notifications,
  reconciliationRuns,
  rewardPeriods,
  vaultPositions,
  adminRoles,
  type Db,
  finalizeSealedHunt,
} from "@near-district/db";
import { campaignMachine, type CampaignRules, type CampaignState } from "@near-district/core";
import { ledgerMovesForEvent, type NearRpc, type RheaClient, type VaultClient, type VaultEvent } from "@near-district/near";
import type { AllowedToken } from "@near-district/core";
import { duePendingVerifications, processVerification, type EngineDeps } from "@near-district/db";
import { NearActivityVerifier, NearBlocksIndexer, NearRpc as ArchiveRpc, archivalRpcUrls, dispatchOnchain } from "@near-district/near";
import { enqueue, RetryLater } from "./queue";
import { processPeriod } from "./rewards";
import type { OperatorSigner } from "./operator";

export interface JobCtx {
  db: Db;
  rpc: NearRpc;
  vault: VaultClient | null;
  rhea: RheaClient;
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
  // sealed treasure hunts are scored once their deadline passes (idempotent)
  const ended = await ctx.db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.template, "treasure_hunt"), inArray(campaigns.status, ["ENDED", "AWAITING_RESULTS"])));
  for (const c of ended) await finalizeSealedHunt(ctx.db, c.id, now);
  // every funded period that may need work gets a driver job
  // only periods that can make progress: a mission still running needs no waiting job (they would pile up every minute)
  const periods = await ctx.db
    .select({ id: rewardPeriods.id })
    .from(rewardPeriods)
    .where(and(inArray(rewardPeriods.state, ["SCHEDULED", "ELIGIBILITY_FROZEN", "FUNDS_RESERVED", "REQUIRES_REVIEW"]), lt(rewardPeriods.endsAt, now)));
  const bucket = Math.floor(Date.now() / 60_000);
  for (const p of periods) await enqueue(ctx.db, "rewards.period", { periodId: p.id }, { idempotencyKey: `rewards.period:${p.id}:${bucket}` });
  return `moved ${moved}, ${periods.length} periods queued`;
}

export async function rewardsPeriod(ctx: JobCtx, payload: { periodId: string }): Promise<string> {
  return processPeriod({ db: ctx.db, vault: ctx.vault, signer: ctx.signer, network: ctx.network, token: ctx.token, rpc: ctx.rpc, rulesFor: (c) => rulesFor(ctx.db, c) }, payload.periodId);
}

/**
 * Checks the prize vault holds at least what it owes: for every mission we know about,
 * prize - paid - refunded must be covered by the vault's token balance.
 */
export async function vaultReconcile(ctx: JobCtx): Promise<string> {
  if (!ctx.vault) return "no vault";
  const vault = ctx.vault;
  const [run] = await ctx.db.insert(reconciliationRuns).values({ status: "running" }).returning();
  const issues: { kind: string; detail: string }[] = [];
  try {
    const rows = await ctx.db.select({ vid: campaigns.vaultCampaignId }).from(campaigns).where(isNotNull(campaigns.vaultCampaignId));
    let owed = 0n;
    for (const r of rows) {
      const m = await vault.mission(r.vid!);
      if (!m) { issues.push({ kind: "missing_mission", detail: `vault has no mission ${r.vid}` }); continue; }
      owed += BigInt(m.prize) - BigInt(m.paid_total) - BigInt(m.refunded_total);
      if (m.status === "Paying" && m.next_index >= m.winner_count && m.paid_count < m.winner_count) issues.push({ kind: "payout_pending", detail: `mission ${r.vid}: ${m.paid_count}/${m.winner_count} paid` });
    }
    const balance = BigInt(await ctx.rpc.view<string>(ctx.token.contractId, "ft_balance_of", { account_id: vault.contractId }));
    if (balance < owed) issues.push({ kind: "token_shortfall", detail: `token balance ${balance} < owed ${owed}` });
    await ctx.db
      .update(reconciliationRuns)
      .set({ status: issues.length ? "discrepancy" : "ok", finishedAt: new Date(), vaultTokenBalance: balance, vaultLiquidTracked: owed, vaultRheaShares: 0n, rheaReportedShares: 0n, discrepancies: issues })
      .where(eq(reconciliationRuns.id, run!.id));
    if (issues.some((i) => i.kind !== "payout_pending")) {
      const admins = await ctx.db.select({ userId: adminRoles.userId }).from(adminRoles).where(inArray(adminRoles.role, ["superadmin", "finance"]));
      for (const ad of admins) {
        await ctx.db
          .insert(notifications)
          .values({ userId: ad.userId, kind: "reconciliation", title: "Prize vault reconciliation discrepancy", body: issues.map((i) => i.kind).join(", "), link: "/admin", dedupeKey: `recon:${run!.id}` })
          .onConflictDoNothing();
      }
    }
    return issues.length ? `DISCREPANCY ${issues.map((i) => i.kind).join(",")}` : "ok";
  } catch (e) {
    await ctx.db.update(reconciliationRuns).set({ status: "error", finishedAt: new Date(), discrepancies: [{ kind: "error", detail: String(e) }] }).where(eq(reconciliationRuns.id, run!.id));
    throw e;
  }
}

/**
 * Records each mission's prize as read from the prize vault, so the map and mission pages show the
 * on-chain amount (never a form field). bonus_available holds the fixed prize pool, claimed_total what was paid.
 */
export async function vaultSnapshot(ctx: JobCtx): Promise<string> {
  if (!ctx.vault) return "no vault";
  const rows = await ctx.db.select({ id: campaigns.id, vid: campaigns.vaultCampaignId }).from(campaigns).where(isNotNull(campaigns.vaultCampaignId));
  if (rows.length === 0) return "none";
  const height = BigInt(await ctx.rpc.finalBlockHeight());
  let n = 0;
  for (const r of rows) {
    const m = await ctx.vault.mission(r.vid!);
    if (!m) continue;
    await ctx.db.insert(vaultPositions).values({
      campaignId: r.id, blockHeight: height, principalIdle: 0n, principalSupplied: 0n, rheaShares: 0n, positionValue: 0n,
      yieldAvailable: 0n, bonusAvailable: BigInt(m.prize), reserved: 0n, claimedTotal: BigInt(m.paid_total),
    });
    n++;
  }
  return `${n} snapshots`;
}

/** Turns verified vault events into append-only ledger rows (idempotent by event ref). */
export async function indexLedger(ctx: JobCtx): Promise<string> {
  const txs = await ctx.db.select().from(chainTransactions).where(eq(chainTransactions.status, "success")).limit(500);
  let rows = 0;
  for (const t of txs) {
    for (const [i, ev] of (t.events as VaultEvent[]).entries()) {
      const vid = ev.data.mission_id;
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

export async function pruneRateLimits(ctx: JobCtx): Promise<string> {
  const { rateLimits } = await import("@near-district/db");
  await ctx.db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(Date.now() - 86_400_000)));
  const { jobs } = await import("@near-district/db");
  // keep finished jobs for a week of operational history; dead jobs stay until handled
  await ctx.db.delete(jobs).where(and(eq(jobs.status, "done"), lt(jobs.updatedAt, new Date(Date.now() - 7 * 86_400_000))));
  return "pruned";
}

/**
 * Re-runs pending hint verifications (finality, holding periods, RPC recovery). Uses the same engine as the
 * web app, so a pending activity is never marked complete until the chain evidence is final and valid.
 */
export function hintEngineDeps(ctx: JobCtx): EngineDeps {
  const network = ctx.network === "mainnet" ? "mainnet" : "testnet";
  const v = NearActivityVerifier.forNetwork(ctx.rpc, network);
  return {
    walletNetwork: network,
    onchain: v
      ? {
          verify: dispatchOnchain(v, { indexer: new NearBlocksIndexer({ apiKey: process.env.NEARBLOCKS_API_KEY }), archive: new ArchiveRpc({ urls: archivalRpcUrls(network, process.env.NEAR_ARCHIVAL_RPC_URLS) }) }),
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
  "vault.reconcile": (c) => vaultReconcile(c),
  "vault.snapshot": (c) => vaultSnapshot(c),
  "ledger.index": (c) => indexLedger(c),
  "maintenance.prune": (c) => pruneRateLimits(c),
  "hints.reconcile": (c) => hintsReconcile(c),
};

/** Recurring schedule: [job, every N seconds]. Idempotency keys per time bucket prevent duplicates across replicas. */
export const SCHEDULE: [string, number][] = [
  ["campaign.tick", 60],
  ["ledger.index", 120],
  ["vault.reconcile", 600],
  ["vault.snapshot", 120],
  ["maintenance.prune", 3600],
  ["hints.reconcile", 60],
];

export { RetryLater };
