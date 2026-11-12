import "server-only";
import { getNetwork, primaryToken } from "@yielvy/core";
import { NearRpc, RheaClient, VaultClient } from "@yielvy/near";
import { env } from "./env";

let rpc: NearRpc | undefined;
export function nearRpc(): NearRpc {
  rpc ??= new NearRpc({ urls: env().NEAR_RPC_URLS.split(",").map((s) => s.trim()).filter(Boolean) });
  return rpc;
}

export function network() {
  return getNetwork(env().NEAR_NETWORK);
}

/**
 * The prize token. Shown to people as "USD" (it is a dollar stablecoin); the contract id and
 * decimals are unchanged, and the on-chain symbol (e.g. USDC.e) is only used by the NEAR checks.
 */
export function token() {
  return { ...primaryToken(network()), symbol: "USD" };
}

export function rhea(): RheaClient {
  return new RheaClient(nearRpc(), network().rheaLendingContract);
}

/** null when no vault is deployed/configured — callers must render an honest state. */
export function vault(): VaultClient | null {
  const id = env().VAULT_CONTRACT_ID;
  return id ? new VaultClient(nearRpc(), id) : null;
}

