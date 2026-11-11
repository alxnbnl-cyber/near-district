import "server-only";
import { createPublicKey, verify as verifySig, type JsonWebKey } from "node:crypto";
import { base58Decode } from "@yielvy/near";
import { env } from "./env";
import { nearRpc } from "./near";
import { HttpError } from "./http";

/**
 * NEAR Auth (FastAuth): Web2 login (Auth0) whose identity deterministically maps to a NEAR key derived by NEAR's MPC
 * network. We never trust the browser for the account: the server verifies the Auth0 ID token, then derives the key
 * itself from the MPC contract exactly like the SDK (path `jwt#https://{domain}/#{sub}`, predecessor = FastAuth contract),
 * and uses the implicit account of that key (64-char hex, exists as soon as it receives funds).
 */
const NETWORK = {
  testnet: { domain: "login.testnet.fast-auth.com", fastAuth: "fast-auth.testnet", mpc: "v1.signer-prod.testnet", clientId: "np8paqIpMWmNbzT4xAvOOapZBjsOpptl" },
  mainnet: { domain: "login.auth.near.org", fastAuth: "fast-auth.near", mpc: "v1.signer", clientId: "" },
} as const;

export function nearAuthConfig() {
  const n = NETWORK[env().NEAR_NETWORK];
  return { ...n, clientId: process.env.NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID || n.clientId };
}

type Jwk = JsonWebKey & { kid?: string };
let jwks: { at: number; keys: Jwk[] } | null = null;
async function signingKey(kid: string): Promise<Jwk> {
  const { domain } = nearAuthConfig();
  if (!jwks || Date.now() - jwks.at > 3_600_000 || !jwks.keys.some((k) => k.kid === kid)) {
    const r = await fetch(`https://${domain}/.well-known/jwks.json`);
    if (!r.ok) throw new HttpError(502, "Couldn't reach the NEAR Auth login service.");
    jwks = { at: Date.now(), keys: ((await r.json()) as { keys: Jwk[] }).keys };
  }
  const k = jwks.keys.find((x) => x.kid === kid);
  if (!k) throw new HttpError(401, "Unknown login signing key.", "unauthenticated");
  return k;
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Verifies an Auth0 ID token (RS256) from the NEAR Auth tenant; returns its claims. */
export async function verifyNearAuthIdToken(raw: string): Promise<{ sub: string; email: string | null; name: string | null }> {
  const parts = raw.split(".");
  if (parts.length !== 3) throw new HttpError(401, "Malformed login token.", "unauthenticated");
  const [h, p, s] = parts as [string, string, string];
  const header = JSON.parse(b64url(h).toString()) as { alg: string; kid: string };
  if (header.alg !== "RS256") throw new HttpError(401, "Unsupported login token.", "unauthenticated");
  const key = createPublicKey({ key: await signingKey(header.kid), format: "jwk" });
  if (!verifySig("RSA-SHA256", Buffer.from(`${h}.${p}`), key, b64url(s))) throw new HttpError(401, "Login token signature is invalid.", "unauthenticated");
  const c = JSON.parse(b64url(p).toString()) as { iss: string; aud: string | string[]; exp: number; sub: string; email?: string; email_verified?: boolean; name?: string };
  const { domain, clientId } = nearAuthConfig();
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (c.iss !== `https://${domain}/` || !aud.includes(clientId)) throw new HttpError(401, "Login token is for another app.", "unauthenticated");
  if (c.exp * 1000 < Date.now() - 60_000) throw new HttpError(401, "Login expired. Please sign in again.", "unauthenticated");
  if (!c.sub) throw new HttpError(401, "Login token has no subject.", "unauthenticated");
  return { sub: c.sub, email: c.email && c.email_verified !== false ? c.email : null, name: c.name ?? null };
}

/** The NEAR key NEAR's MPC network controls for this identity, and its implicit account id. */
export async function deriveNearAccount(sub: string): Promise<{ publicKey: string; accountId: string }> {
  const { domain, fastAuth, mpc } = nearAuthConfig();
  const publicKey = await nearRpc().view<string>(mpc, "derived_public_key", { path: `jwt#https://${domain}/#${sub}`, predecessor: fastAuth, domain_id: 1 });
  if (typeof publicKey !== "string" || !publicKey.startsWith("ed25519:")) throw new HttpError(502, "Couldn't derive your NEAR key.");
  const bytes = base58Decode(publicKey.slice("ed25519:".length));
  if (bytes.length !== 32) throw new HttpError(502, "Unexpected NEAR key format.");
  return { publicKey, accountId: Buffer.from(bytes).toString("hex") };
}
