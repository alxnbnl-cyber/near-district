"use client";

import { api } from "./api";

/** Browser-injected EVM wallet (MetaMask, Rabby, Coinbase…) via EIP-1193. */
type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<unknown>; isMetaMask?: boolean; isRabby?: boolean; isCoinbaseWallet?: boolean };
/** Phantom / Solflare / Backpack expose this shape. */
type SolanaProvider = {
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(msg: Uint8Array, display?: "utf8"): Promise<{ signature: Uint8Array } | Uint8Array>;
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
};

declare global {
  interface Window {
    ethereum?: Eip1193;
    solana?: SolanaProvider;
    phantom?: { solana?: SolanaProvider };
  }
}

export const hasEvm = () => typeof window !== "undefined" && Boolean(window.ethereum);
export const hasSolana = () => typeof window !== "undefined" && Boolean(window.phantom?.solana ?? window.solana);

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const utf8Hex = (s: string) => "0x" + hex(new TextEncoder().encode(s));

/** Connect the injected EVM wallet, sign the server challenge (personal_sign), link it. */
export async function linkEvmWallet(): Promise<{ address: string }> {
  const eth = window.ethereum;
  if (!eth) throw new Error("No EVM wallet found. Install MetaMask or Rabby.");
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts[0];
  if (!address) throw new Error("No account selected.");
  const ch = await api<{ nonce: string; message: string; address: string }>("/api/wallets/external/challenge", { method: "POST", body: { chain: "evm", address } });
  const signature = (await eth.request({ method: "personal_sign", params: [utf8Hex(ch.message), address] })) as string;
  const walletApp = eth.isRabby ? "rabby" : eth.isCoinbaseWallet ? "coinbase" : eth.isMetaMask ? "metamask" : "injected";
  return api("/api/wallets/external/verify", { method: "POST", body: { chain: "evm", nonce: ch.nonce, signature, walletApp } });
}

/** Connect Phantom (or another injected Solana wallet), sign the challenge, link it. */
export async function linkSolanaWallet(): Promise<{ address: string }> {
  const sol = window.phantom?.solana ?? window.solana;
  if (!sol) throw new Error("No Solana wallet found. Install Phantom.");
  const { publicKey } = await sol.connect();
  const address = publicKey.toString();
  const ch = await api<{ nonce: string; message: string }>("/api/wallets/external/challenge", { method: "POST", body: { chain: "solana", address } });
  const res = await sol.signMessage(new TextEncoder().encode(ch.message), "utf8");
  const sig = res instanceof Uint8Array ? res : res.signature;
  const walletApp = sol.isPhantom ? "phantom" : sol.isSolflare ? "solflare" : sol.isBackpack ? "backpack" : "injected";
  return api("/api/wallets/external/verify", { method: "POST", body: { chain: "solana", nonce: ch.nonce, signature: hex(sig), walletApp } });
}

/** Sign in with an injected EVM wallet (creates the Yielvy profile on first use). */
export async function signInWithEvm(): Promise<{ address: string }> {
  const eth = window.ethereum;
  if (!eth) throw new Error("No EVM wallet found. Install MetaMask or Rabby.");
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts[0];
  if (!address) throw new Error("No account selected.");
  const ch = await api<{ nonce: string; message: string }>("/api/auth/wallet/challenge", { method: "POST", body: { chain: "evm", address } });
  const signature = (await eth.request({ method: "personal_sign", params: [utf8Hex(ch.message), address] })) as string;
  const walletApp = eth.isRabby ? "rabby" : eth.isCoinbaseWallet ? "coinbase" : eth.isMetaMask ? "metamask" : "injected";
  return api("/api/auth/wallet/verify", { method: "POST", body: { chain: "evm", nonce: ch.nonce, signature, walletApp } });
}

/** Sign in with Phantom / another injected Solana wallet. */
export async function signInWithSolana(): Promise<{ address: string }> {
  const sol = window.phantom?.solana ?? window.solana;
  if (!sol) throw new Error("No Solana wallet found. Install Phantom.");
  const { publicKey } = await sol.connect();
  const address = publicKey.toString();
  const ch = await api<{ nonce: string; message: string }>("/api/auth/wallet/challenge", { method: "POST", body: { chain: "solana", address } });
  const res = await sol.signMessage(new TextEncoder().encode(ch.message), "utf8");
  const sig = res instanceof Uint8Array ? res : res.signature;
  const walletApp = sol.isPhantom ? "phantom" : sol.isSolflare ? "solflare" : sol.isBackpack ? "backpack" : "injected";
  return api("/api/auth/wallet/verify", { method: "POST", body: { chain: "solana", nonce: ch.nonce, signature: hex(sig), walletApp } });
}
