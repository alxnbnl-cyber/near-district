"use client";

/**
 * NEAR wallet integration (client only). Yielvy never creates, sees or stores private keys:
 * every signature and transaction is approved inside the user's own wallet.
 */
import type { WalletSelector, Wallet, WalletModuleFactory } from "@near-wallet-selector/core";
import { api } from "./api";

let selectorPromise: Promise<WalletSelector> | null = null;

export const NEAR_NETWORK = (process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet") as "mainnet" | "testnet";

export function getSelector(): Promise<WalletSelector> {
  selectorPromise ??= (async () => {
    const [{ setupWalletSelector }, { setupMyNearWallet }, { setupMeteorWallet }] = await Promise.all([
      import("@near-wallet-selector/core"),
      import("@near-wallet-selector/my-near-wallet"),
      import("@near-wallet-selector/meteor-wallet"),
    ]);
    return setupWalletSelector({
      network: NEAR_NETWORK,
      modules: [setupMyNearWallet() as WalletModuleFactory, setupMeteorWallet() as WalletModuleFactory],
    });
  })();
  return selectorPromise;
}

export interface WalletOption {
  id: string;
  name: string;
  iconUrl: string;
  available: boolean;
}

export async function walletOptions(): Promise<WalletOption[]> {
  const s = await getSelector();
  return s.store.getState().modules.map((m) => ({
    id: m.id,
    name: m.metadata.name,
    iconUrl: m.metadata.iconUrl,
    available: m.metadata.available,
  }));
}

type Purpose = "near_login" | "link_wallet" | "step_up";

/**
 * NEP-413 challenge → wallet signature → server verification.
 * Browser wallets (MyNearWallet) redirect back to /signin/near-callback to finish.
 */
export async function proveWallet(walletId: string, purpose: Purpose, returnTo = "/"): Promise<"done" | "redirecting"> {
  const ch = await api<{ nonce: string; recipient: string; message: string }>("/api/auth/near/challenge", {
    method: "POST",
    body: { purpose },
  });
  const s = await getSelector();
  const wallet: Wallet = await s.wallet(walletId);
  if (!wallet.signMessage) throw new Error("This wallet cannot sign messages. Please choose another wallet.");
  sessionStorage.setItem("yv_near_pending", JSON.stringify({ nonce: ch.nonce, returnTo }));
  const signed = await wallet.signMessage({
    message: ch.message,
    recipient: ch.recipient,
    nonce: Buffer.from(ch.nonce, "base64"),
    callbackUrl: `${window.location.origin}/signin/near-callback`,
    state: ch.nonce,
  });
  if (!signed) return "redirecting";
  await api("/api/auth/near/verify", {
    method: "POST",
    body: { nonce: ch.nonce, accountId: signed.accountId, publicKey: signed.publicKey, signature: signed.signature },
  });
  sessionStorage.removeItem("yv_near_pending");
  return "done";
}

export interface FnCall {
  receiverId: string;
  methodName: string;
  args: object;
  gasTgas: number;
  depositYocto: string;
}

/**
 * Asks the user's wallet to sign and send transactions. Returns tx hashes when the wallet
 * reports them; the server ALWAYS re-verifies each hash against the chain before acting.
 */
export async function sendTransactions(walletId: string, signerId: string, calls: FnCall[]): Promise<string[]> {
  const s = await getSelector();
  const { actionCreators } = await import("@near-wallet-selector/core");
  const wallet = await s.wallet(walletId);
  const accounts = await wallet.getAccounts();
  if (!accounts.some((a) => a.accountId === signerId)) {
    await (wallet as { signIn: (p: object) => Promise<unknown> }).signIn({ accounts: [], successUrl: window.location.href });
  }
  const outcomes = await wallet.signAndSendTransactions({
    transactions: calls.map((c) => ({
      signerId,
      receiverId: c.receiverId,
      actions: [actionCreators.functionCall(c.methodName, c.args, BigInt(c.gasTgas) * 10n ** 12n, BigInt(c.depositYocto))],
    })),
  });
  return (outcomes ?? []).map((o) => o.transaction_outcome?.id ?? (o as { transaction?: { hash?: string } }).transaction?.hash ?? "").filter(Boolean);
}
