import "server-only";
import { and, eq, walletConnections, type Db } from "@yielvy/db";
import { formatDisplay } from "@yielvy/core";
import { receiptSucceeded } from "@yielvy/near";
import { env } from "./env";
import { nearRpc, network, token } from "./near";

/**
 * Cash-out (offramp) for the testnet demo.
 *  - "testnet":   the player signs a real testnet ft_transfer of the prize token to OFFRAMP_ACCOUNT_ID; we verify it on
 *                 chain. The bank payout that would follow is simulated (there is no fiat on testnet).
 *  - "simulated": testnet without an offramp account: the whole flow is a labelled simulation, no transaction.
 *  - "off":       mainnet. Never simulated with real money.
 */
export type OfframpMode = "testnet" | "simulated" | "off";

export function offrampMode(): OfframpMode {
  const e = env();
  if (e.NEAR_NETWORK !== "testnet") return "off";
  return e.OFFRAMP_ACCOUNT_ID ? "testnet" : "simulated";
}

export async function walletBalance(account: string): Promise<bigint> {
  const raw = await nearRpc().view<string>(token().contractId, "ft_balance_of", { account_id: account });
  return BigInt(raw ?? "0");
}

export async function verifiedWallets(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({ a: walletConnections.accountId })
    .from(walletConnections)
    .where(and(eq(walletConnections.userId, userId), eq(walletConnections.network, network().networkId)));
  return rows.map((r) => r.a);
}

/**
 * Re-derives the cash-out transfer from the FINAL transaction: signed by one of the player's verified wallets,
 * a successful receipt executed by the prize token contract, emitting a NEP-141 ft_transfer to the offramp account.
 */
export async function verifyOfframpTransfer(txHash: string, wallets: string[]): Promise<{ ok: true; amount: bigint; from: string } | { ok: false; reason: string }> {
  const dest = env().OFFRAMP_ACCOUNT_ID;
  if (!dest) return { ok: false, reason: "Cash-out isn't set up on this deployment." };
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(txHash)) return { ok: false, reason: "That doesn't look like a transaction hash." };
  const t = token();
  for (const w of wallets) {
    let o;
    try {
      o = await nearRpc().txStatus(txHash, w);
    } catch {
      continue;
    }
    if (o.transaction.signer_id !== w) continue;
    if (o.transaction.receiver_id !== t.contractId) return { ok: false, reason: "The transfer wasn't sent to the prize token." };
    for (const r of o.receipts_outcome) {
      if (r.outcome.executor_id !== t.contractId || !receiptSucceeded(r)) continue;
      for (const log of r.outcome.logs) {
        if (!log.startsWith("EVENT_JSON:")) continue;
        try {
          const ev = JSON.parse(log.slice("EVENT_JSON:".length)) as { standard?: string; event?: string; data?: { old_owner_id: string; new_owner_id: string; amount: string }[] };
          if (ev.standard !== "nep141" || ev.event !== "ft_transfer" || !Array.isArray(ev.data)) continue;
          const hit = ev.data.find((d) => d.old_owner_id === w && d.new_owner_id === dest);
          if (hit) return { ok: true, amount: BigInt(hit.amount), from: w };
        } catch {
          /* not JSON */
        }
      }
    }
    return { ok: false, reason: "No successful transfer to the cash-out account in that transaction." };
  }
  return { ok: false, reason: "Couldn't find that transaction from your verified wallet yet. Try again in a few seconds." };
}

export const fmt = (v: bigint) => formatDisplay(v, token().decimals);
