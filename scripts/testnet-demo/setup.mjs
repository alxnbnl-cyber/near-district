/**
 * Testnet demo setup (NEAR testnet only, test tokens with no value). Idempotent: every step checks chain state first.
 *
 *   node scripts/testnet-demo/setup.mjs accounts   create vault / ops / sponsor accounts from the testnet faucet
 *   node scripts/testnet-demo/setup.mjs vault      deploy + init the vault, register storage with token and lending
 *   node scripts/testnet-demo/setup.mjs mint <n>   mint n USDC.e (usdc.fakes.testnet) to the sponsor
 *   node scripts/testnet-demo/setup.mjs status     print balances and config
 *
 * Keys are written to ~/.near-credentials/testnet/<account>.json (the standard NEAR CLI location), never to the repo.
 * Demo state (account names) lives in .data/testnet-demo.json (gitignored).
 */
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(new URL("../../apps/worker/package.json", import.meta.url));
const { Account, JsonRpcProvider, KeyPair, KeyPairSigner, parseNearAmount } = require("near-api-js");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "../..");
const STATE = path.join(ROOT, ".data", "testnet-demo.json");
const CREDS = path.join(os.homedir(), ".near-credentials", "testnet");
const RPC = "https://rpc.testnet.fastnear.com";
const FAUCET = "https://helper.testnet.near.org/account";
export const TOKEN = "usdc.fakes.testnet";
export const LENDING = "contract.1638481328.burrow.testnet";
const WASM = path.join(ROOT, "contracts/vault/target/wasm32-unknown-unknown/release/yielvy_vault.wasm");

const provider = new JsonRpcProvider({ url: RPC });
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
const save = () => {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
};

function keyFor(accountId) {
  const f = path.join(CREDS, `${accountId}.json`);
  if (!fs.existsSync(f)) throw new Error(`No key for ${accountId} in ${CREDS}`);
  return KeyPair.fromString(JSON.parse(fs.readFileSync(f, "utf8")).private_key);
}
export function account(accountId) {
  return new Account(accountId, provider, new KeyPairSigner(keyFor(accountId)));
}
async function exists(accountId) {
  try {
    await provider.query({ request_type: "view_account", finality: "final", account_id: accountId });
    return true;
  } catch {
    return false;
  }
}
export async function view(contractId, method, args = {}) {
  const r = await provider.query({ request_type: "call_function", finality: "final", account_id: contractId, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") });
  return JSON.parse(Buffer.from(r.result).toString() || "null");
}
export async function call(signerId, contractId, methodName, args, { gasTgas = 100, deposit = "0" } = {}) {
  const res = await account(signerId).callFunctionRaw({ contractId, methodName, args, gas: BigInt(gasTgas) * 10n ** 12n, deposit: BigInt(deposit), waitUntil: "FINAL" });
  const failure = res.status?.Failure ?? res.receipts_outcome?.find((r) => r.outcome.status?.Failure)?.outcome.status.Failure;
  if (failure) throw new Error(`${methodName} failed: ${JSON.stringify(failure).slice(0, 400)}`);
  return res;
}

async function createViaFaucet(accountId) {
  if (await exists(accountId)) return "exists";
  const kp = KeyPair.fromRandom("ed25519");
  const r = await fetch(FAUCET, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: kp.getPublicKey().toString() }) });
  if (!r.ok) throw new Error(`faucet ${r.status}: ${(await r.text()).slice(0, 200)}`);
  fs.mkdirSync(CREDS, { recursive: true });
  fs.writeFileSync(path.join(CREDS, `${accountId}.json`), JSON.stringify({ account_id: accountId, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }), { mode: 0o600 });
  for (let i = 0; i < 20 && !(await exists(accountId)); i++) await new Promise((res) => setTimeout(res, 1500));
  return "created";
}

const cmd = process.argv[2];
if (cmd === "accounts") {
  const tag = state.tag ?? randomBytes(3).toString("hex");
  state.tag = tag;
  state.vault ??= `yielvy-vault-${tag}.testnet`;
  state.ops ??= `yielvy-ops-${tag}.testnet`;
  state.sponsor ??= `yielvy-sponsor-${tag}.testnet`;
  save();
  for (const k of ["vault", "ops", "sponsor"]) console.log(k, state[k], await createViaFaucet(state[k]));
} else if (cmd === "vault") {
  const code = await provider.query({ request_type: "view_code", finality: "final", account_id: state.vault }).catch(() => null);
  if (!code?.code_base64) {
    await account(state.vault).deployContract(fs.readFileSync(WASM));
    console.log("deployed", state.vault);
  } else console.log("code already deployed");
  const cfg = await view(state.vault, "get_config").catch(() => null);
  if (!cfg) {
    await call(state.vault, state.vault, "new", {
      owner_id: state.ops,
      operator_id: state.ops,
      guardian_id: state.ops,
      token_id: TOKEN,
      lending_id: LENDING,
      extra_decimals: 12,
      fee_bps: 0,
      fee_recipient: state.ops,
      safety_buffer_bps: 50,
      dispute_window_ns: "3600000000000",
      upgrade_timelock_ns: "259200000000000",
    });
    console.log("initialised");
  } else console.log("already initialised");
  for (const acct of [state.vault, state.sponsor, state.ops]) {
    if (!(await view(TOKEN, "storage_balance_of", { account_id: acct }))) {
      await call(state.ops, TOKEN, "storage_deposit", { account_id: acct, registration_only: true }, { gasTgas: 30, deposit: parseNearAmount("0.00125") });
      console.log("token storage", acct);
    }
  }
  if (!(await view(LENDING, "storage_balance_of", { account_id: state.vault }))) {
    await call(state.ops, LENDING, "storage_deposit", { account_id: state.vault }, { gasTgas: 30, deposit: parseNearAmount("0.1") });
    console.log("lending storage", state.vault);
  }
  console.log(await view(state.vault, "get_config"));
} else if (cmd === "mint") {
  const n = BigInt(process.argv[3] ?? "0");
  if (n <= 0n) throw new Error("usage: mint <whole USDC.e>");
  await call(state.sponsor, TOKEN, "mint", { account_id: state.sponsor, amount: (n * 1_000_000n).toString() }, { gasTgas: 30 });
  console.log("minted", n.toString(), "USDC.e →", state.sponsor, "balance", await view(TOKEN, "ft_balance_of", { account_id: state.sponsor }));
} else if (cmd === "status") {
  console.log(state);
  for (const k of ["vault", "ops", "sponsor"]) {
    if (!state[k]) continue;
    const near = await account(state[k]).getBalance().catch(() => null);
    console.log(k, "NEAR", near?.toString?.() ?? "?", "USDC.e", await view(TOKEN, "ft_balance_of", { account_id: state[k] }).catch(() => "?"));
  }
} else if (cmd) {
  // allow other scripts to import helpers
} else {
  console.log("commands: accounts | vault | mint <n> | status");
}
export { state, save };
