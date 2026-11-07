import "server-only";
import { getNetwork, primaryToken } from "@yielvy/core";
import { NearRpc, RheaClient, VaultClient, OneClickClient } from "@yielvy/near";
import { env } from "./env";

let rpc: NearRpc | undefined;
export function nearRpc(): NearRpc {
  rpc ??= new NearRpc({ urls: env().NEAR_RPC_URLS.split(",").map((s) => s.trim()).filter(Boolean) });
  return rpc;
}

export function network() {
  return getNetwork(env().NEAR_NETWORK);
}

export function token() {
  return primaryToken(network());
}

export function rhea(): RheaClient {
  return new RheaClient(nearRpc(), network().rheaLendingContract);
}

/** null when no vault is deployed/configured — callers must render an honest state. */
export function vault(): VaultClient | null {
  const id = env().VAULT_CONTRACT_ID;
  return id ? new VaultClient(nearRpc(), id) : null;
}

export function oneClick(): OneClickClient {
  return new OneClickClient({ jwt: env().ONE_CLICK_JWT });
}
