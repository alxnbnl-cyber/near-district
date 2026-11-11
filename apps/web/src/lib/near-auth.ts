"use client";

import { api } from "./api";

/**
 * NEAR Auth sign-in (Google / email via Auth0, keys held by NEAR's MPC network). Opens the NEAR Auth popup, then hands
 * the ID token to our server, which verifies it and derives the user's NEAR account itself.
 */
const NETWORK = (process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet") as "mainnet" | "testnet";
const CLIENT_ID = process.env.NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID || (NETWORK === "testnet" ? "np8paqIpMWmNbzT4xAvOOapZBjsOpptl" : "");

export const nearAuthAvailable = () => Boolean(CLIENT_ID);

export async function signInWithNearAuth(): Promise<{ accountId: string }> {
  if (!CLIENT_ID) throw new Error("NEAR Auth isn't configured for this network yet.");
  const { JavascriptProvider } = await import("@fast-auth-near/javascript-provider");
  const provider = new JavascriptProvider({ network: NETWORK, clientId: CLIENT_ID });
  await provider.login(undefined, true);
  // The provider keeps its Auth0 client private; the raw ID token is what our server verifies.
  const claims = await (provider as unknown as { client: { getIdTokenClaims(): Promise<{ __raw?: string } | undefined> } }).client.getIdTokenClaims();
  if (!claims?.__raw) throw new Error("Sign-in was cancelled.");
  return api("/api/auth/near-auth", { method: "POST", body: { idToken: claims.__raw } });
}
