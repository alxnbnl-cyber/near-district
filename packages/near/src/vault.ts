/** Typed reads of the Yielvy vault contract and NEP-297 event parsing. */
import type { NearRpc } from "./rpc";

export interface VaultCampaign {
  sponsor: string;
  status: "Active" | "Closing";
  principal_idle: string;
  principal_supplied: string;
  rhea_shares: string;
  yield_available: string;
  bonus_available: string;
  reserved: string;
  claimed_total: string;
  yield_realized_total: string;
  max_operator_reserve_per_period: string;
  require_sponsor_finalize: boolean;
  random_enabled: boolean;
  created_at: string;
}

export interface VaultPeriod {
  status: "Committed" | "Finalized" | "Vetoed" | "Closed";
  eligibility_root: string;
  eligible_count: number;
  committed_height: string;
  seed: string | null;
  reserved_yield: string;
  reserved_bonus: string;
  allocation_root: string | null;
  allocated_total: string;
  claimed_amount: string;
  claimable_after: string;
  claim_deadline: string;
}

export interface VaultConfig {
  owner_id: string;
  operator_id: string;
  guardian_id: string;
  token_id: string;
  lending_id: string;
  extra_decimals: number;
  fee_bps: number;
  fee_recipient: string;
  safety_buffer_bps: number;
  dispute_window_ns: string;
  upgrade_timelock_ns: string;
  pending_upgrade: { code_hash: string; eta: string } | null;
  pause: { inflows: boolean; all: boolean };
}

export interface VaultTotals {
  campaigns: string;
  total_rhea_shares: string;
  liquid_tracked: string;
  fees_accrued: string;
  pending_op: { op_id: string; campaign_id: string; purpose: string; amount: string; started_at: string; started_height: string } | null;
}

export class VaultClient {
  constructor(private readonly rpc: NearRpc, readonly contractId: string) {}
  config() {
    return this.rpc.view<VaultConfig>(this.contractId, "get_config");
  }
  totals() {
    return this.rpc.view<VaultTotals>(this.contractId, "get_totals");
  }
  campaign(id: bigint) {
    return this.rpc.view<VaultCampaign | null>(this.contractId, "get_campaign", { campaign_id: id.toString() });
  }
  period(campaignId: bigint, periodId: number) {
    return this.rpc.view<VaultPeriod | null>(this.contractId, "get_period", { campaign_id: campaignId.toString(), period_id: periodId });
  }
  isClaimed(campaignId: bigint, periodId: number, accountId: string) {
    return this.rpc.view<boolean>(this.contractId, "is_claimed", { campaign_id: campaignId.toString(), period_id: periodId, account_id: accountId });
  }
  invariants() {
    return this.rpc.view<{ ok: boolean; liquid_sum: string; liquid_tracked: string; shares_sum: string; total_rhea_shares: string }>(
      this.contractId,
      "check_invariants",
      { limit: 500 },
    );
  }
}

export interface VaultEvent {
  event: string;
  data: Record<string, string>;
}

/** Parses `EVENT_JSON:` logs emitted by the vault. Ignores logs from any other standard. */
export function parseVaultEvents(logs: string[]): VaultEvent[] {
  const out: VaultEvent[] = [];
  for (const log of logs) {
    if (!log.startsWith("EVENT_JSON:")) continue;
    try {
      const j = JSON.parse(log.slice("EVENT_JSON:".length)) as { standard?: string; event?: string; data?: Record<string, string>[] };
      if (j.standard !== "yielvy_vault" || !j.event || !Array.isArray(j.data)) continue;
      for (const d of j.data) out.push({ event: j.event, data: d });
    } catch {
      // malformed logs are ignored, never guessed at
    }
  }
  return out;
}

export type LedgerMove = { bucket: string; delta: bigint };

/**
 * Translates a vault event into ledger bucket movements. This is the ONLY way ledger rows
 * are created: from verified on-chain events, never from API input.
 */
export function ledgerMovesForEvent(e: VaultEvent): LedgerMove[] {
  const a = (k: string) => BigInt(e.data[k] ?? "0");
  switch (e.event) {
    case "principal_funded":
      return [{ bucket: "principal_idle", delta: a("amount") }];
    case "bonus_funded":
      return [{ bucket: "bonus_available", delta: a("amount") }];
    case "supplied":
      return [
        { bucket: "principal_idle", delta: -a("amount") },
        { bucket: "principal_supplied", delta: a("amount") },
      ];
    case "withdraw_settled": {
      const moves: LedgerMove[] = [];
      if (a("principal") > 0n) {
        moves.push({ bucket: "principal_supplied", delta: -a("principal") }, { bucket: "principal_idle", delta: a("principal") });
      }
      if (a("loss") > 0n) moves.push({ bucket: "principal_supplied", delta: -a("loss") });
      if (a("yield") > 0n) moves.push({ bucket: "yield_available", delta: a("yield") });
      if (a("fee") > 0n) moves.push({ bucket: "fees", delta: a("fee") });
      return moves;
    }
    case "funds_reserved":
      return [
        { bucket: "yield_available", delta: -a("from_yield") },
        { bucket: "bonus_available", delta: -a("from_bonus") },
        { bucket: "reserved", delta: a("from_yield") + a("from_bonus") },
      ].filter((m) => m.delta !== 0n);
    case "claim_confirmed":
      return [
        { bucket: "reserved", delta: -a("amount") },
        { bucket: "claimed", delta: a("amount") },
      ];
    case "period_finalized":
    case "period_closed": {
      const b = a("bonus_returned");
      const y = a("yield_returned");
      return [
        { bucket: "reserved", delta: -(b + y) },
        { bucket: "bonus_available", delta: b },
        { bucket: "yield_available", delta: y },
      ].filter((m) => m.delta !== 0n);
    }
    case "sponsor_withdraw_confirmed": {
      const p = a("principal");
      const y = a("yield");
      const b = a("bonus");
      return [
        { bucket: "principal_idle", delta: -p },
        { bucket: "yield_available", delta: -y },
        { bucket: "bonus_available", delta: -b },
        { bucket: "withdrawn", delta: p + y + b },
      ].filter((m) => m.delta !== 0n);
    }
    case "fees_withdrawn":
      return [{ bucket: "fees", delta: -a("amount") }];
    default:
      // claim_started/claim_failed and sponsor_withdraw_started/failed net to zero within
      // one transaction; only the confirmed outcome moves the ledger.
      return [];
  }
}
