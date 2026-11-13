# Testnet deployment (demo)

Everything here is on **NEAR testnet**: test tokens with no value. You run these commands yourself with
[near-cli-rs](https://github.com/near/near-cli-rs) (`near`), signing with your own testnet keys. Nothing in
the app deploys contracts or signs for you.

Verified 2026-11-11 with `pnpm verify:live --network testnet` (read-only):

| Fact | Value |
|---|---|
| Lending (RHEA / Burrow) | `contract.1638481328.burrow.testnet`, deposit + withdraw enabled, ~10.6 % supply APR |
| Prize token | `usdc.fakes.testnet` (symbol `USDC.e`, 6 decimals, Burrow `extra_decimals` 12) |
| Token storage deposit | 0.00125 NEAR · Burrow storage minimum 0.1 NEAR |
| Swap exchange (hints) | `ref-finance-101.testnet` |
| Pool liquidity | ~95 % borrowed, ~21.8k USDC.e withdrawable: keep demo deposits small |

Not available on testnet: cross-chain funding (1Click / NEAR Intents is mainnet only).

## 0. Accounts

```bash
near account create-account sponsor-by-faucet-service yielvy-vault-<you>.testnet autogenerate-new-keypair save-to-keychain network-config testnet create
near account create-account sponsor-by-faucet-service yielvy-ops-<you>.testnet autogenerate-new-keypair save-to-keychain network-config testnet create
```

Placeholders below: `VAULT=yielvy-vault-<you>.testnet`, `OPS=yielvy-ops-<you>.testnet` (owner, operator,
guardian and fee recipient for the demo), `SPONSOR=<your testnet wallet>`, `USDC=usdc.fakes.testnet`,
`RHEA=contract.1638481328.burrow.testnet`.

## 1. Build and deploy

```bash
pnpm build:contract   # contracts/vault/target/wasm32-unknown-unknown/release/yielvy_vault.wasm
near contract deploy $VAULT use-file contracts/vault/target/wasm32-unknown-unknown/release/yielvy_vault.wasm with-init-call new json-args "{\"owner_id\":\"$OPS\",\"operator_id\":\"$OPS\",\"guardian_id\":\"$OPS\",\"token_id\":\"$USDC\",\"lending_id\":\"$RHEA\",\"extra_decimals\":12,\"fee_bps\":1000,\"fee_recipient\":\"$OPS\",\"safety_buffer_bps\":50,\"dispute_window_ns\":\"3600000000000\",\"upgrade_timelock_ns\":\"259200000000000\"}" prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
near contract call-function as-read-only $VAULT get_config json-args {} network-config testnet now
```

## 2. Register the vault with the token and the lending pool

```bash
near contract call-function as-transaction $USDC storage_deposit json-args "{\"account_id\":\"$VAULT\",\"registration_only\":true}" prepaid-gas '30 Tgas' attached-deposit '0.00125 NEAR' sign-as $SPONSOR network-config testnet sign-with-keychain send
near contract call-function as-transaction $RHEA storage_deposit json-args "{\"account_id\":\"$VAULT\"}" prepaid-gas '30 Tgas' attached-deposit '0.1 NEAR' sign-as $SPONSOR network-config testnet sign-with-keychain send
```

## 3. Get test USDC.e

Swap testnet NEAR for USDC.e on the RHEA testnet app (exchange `ref-finance-101.testnet`), or use the token's
faucet/mint if your wallet offers it. Register your wallet with the token first if needed (same
`storage_deposit` call with your account).

## 4. Point the app at the vault

In `apps/web/.env.local` (and the worker env):

```
VAULT_CONTRACT_ID=yielvy-vault-<you>.testnet
```

Restart the dev server. Funding, prize pools and claims switch on; the funding page uses the testnet vault.

## 5. Cash-out (offramp) demo

Players can cash out their prize from the Progress panel. On testnet the token transfer is real and the bank
payout is **simulated** (there is no fiat on testnet); the UI labels it that way. Pick an account to receive the
transfers (the ops account is fine), register it with the token, and set it:

```bash
near contract call-function as-transaction $USDC storage_deposit json-args "{\"account_id\":\"$OPS\",\"registration_only\":true}" prepaid-gas '30 Tgas' attached-deposit '0.00125 NEAR' sign-as $SPONSOR network-config testnet sign-with-keychain send
```

```
OFFRAMP_ACCOUNT_ID=yielvy-ops-<you>.testnet
```

Without `OFFRAMP_ACCOUNT_ID` the cash-out runs as a full simulation (no transaction). It is never offered on mainnet.

## 6. Smoke test (same flow as mainnet, small amounts)

`create_campaign` → `ft_transfer_call` with `fund_principal` / `fund_bonus` → `supply` → `harvest_yield` →
`commit_period` / `finalize_period` → winner `claim` → `redeem_principal` → `sponsor_withdraw`. The exact
calls are in `mainnet-verification.md`; replace `network-config mainnet` with `network-config testnet` and the
mainnet ids with the placeholders above.
