/**
 * Typed reads of the NEAR District prize vault (contracts/prize-vault) and NEP-297 event parsing.
 *
 * The vault is a plain escrow: a project locks a fixed prize per mission, and after the deadline the
 * operator posts the winners; the contract pays every winner the same share and refunds the rest.
 */
import type { NearRpc } from "./rpc";

export const VAULT_EVENT_STANDARD = "near_district_prize_vault";

export type MissionStatus = "Open" | "Paying" | "Completed" | "Refunded";
export type PayoutState = "Pending" | "InFlight" | "Paid" | "Failed";

export interface VaultMission {
  mission_id: string;
  sponsor: string;
  deadline_ns: string;
  prize: string;
  status: MissionStatus;
  winner_count: number;
  share: string;
  next_index: number;
  paid_count: number;
  paid_total: string;
  refund_owed: string;
  refunded_total: string;
}

export interface VaultWinner {
  index: number;
  account_id: string;
  state: PayoutState;
}

export interface VaultConfig {
  owner_id: string;
  operator_id: string;
  token_id: string;
  missions: string;
  refund_grace_ns: string;
}

/** Storage the vault charges, in yoctoNEAR (mirrors the contract constants). */
export const VAULT_MISSION_STORAGE = 10_000_000_000_000_000_000_000n; // 0.01 NEAR
export const VAULT_WINNER_STORAGE = 1_500_000_000_000_000_000_000n; // 0.0015 NEAR per winner
export const VAULT_MAX_PAYOUTS_PER_CALL = 10;

export class VaultClient {
  constructor(private readonly rpc: NearRpc, readonly contractId: string) {}
  config() {
    return this.rpc.view<VaultConfig>(this.contractId, "get_config");
  }
  mission(id: bigint) {
    return this.rpc.view<VaultMission | null>(this.contractId, "get_mission", { mission_id: id.toString() });
  }
  async winners(id: bigint, count: number): Promise<VaultWinner[]> {
    const out: VaultWinner[] = [];
    for (let from = 0; from < count; from += 100) {
      out.push(...(await this.rpc.view<VaultWinner[]>(this.contractId, "get_winners", { mission_id: id.toString(), from_index: from, limit: 100 })));
    }
    return out;
  }
}

export interface VaultEvent {
  event: string;
  data: Record<string, string>;
}

/** Parses `EVENT_JSON:` logs emitted by the prize vault. Ignores logs from any other standard. */
export function parseVaultEvents(logs: string[]): VaultEvent[] {
  const out: VaultEvent[] = [];
  for (const log of logs) {
    if (!log.startsWith("EVENT_JSON:")) continue;
    try {
      const j = JSON.parse(log.slice("EVENT_JSON:".length)) as { standard?: string; event?: string; data?: Record<string, unknown>[] };
      if (j.standard !== VAULT_EVENT_STANDARD || !j.event || !Array.isArray(j.data)) continue;
      for (const d of j.data) out.push({ event: j.event, data: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, String(v)])) });
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
 *   bonus_available = prize locked in escrow, claimed = paid to winners, withdrawn = refunded to the project
 */
export function ledgerMovesForEvent(e: VaultEvent): LedgerMove[] {
  const a = (k: string) => BigInt(e.data[k] ?? "0");
  switch (e.event) {
    case "prize_funded":
      return [{ bucket: "bonus_available", delta: a("amount") }];
    case "reward_paid":
      return [
        { bucket: "bonus_available", delta: -a("amount") },
        { bucket: "claimed", delta: a("amount") },
      ];
    case "refund_sent":
      return [
        { bucket: "bonus_available", delta: -a("amount") },
        { bucket: "withdrawn", delta: a("amount") },
      ];
    default:
      // mission_created, winners_finalized, reward_failed, refund_failed, mission_completed move no tokens
      return [];
  }
}
