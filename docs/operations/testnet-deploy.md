# Testnet deployment (demo)

Everything here is on **NEAR testnet**: test tokens with no value, signed with testnet keys from `~/.near-credentials`
using [near-cli-rs](https://github.com/near/near-cli-rs) (`near`).

## Current deployment

| Role | Account |
|---|---|
| Prize vault contract (owner) | `neardistrict-vault.testnet` |
| Operator (worker signer) | `neardistrict-ops.testnet` |
| Prize token | `usdc.fakes.testnet` (testnet USDC, symbol `USDC.e`, 6 decimals, open `mint` for testing) |
| Demo company wallets | `rhea.` / `near.` / `linear.` / `social.neardistrict-host.testnet` |
| Demo explorer wallet | `neardistrict-player.testnet` |

## 1. Accounts

```bash
near account create-account sponsor-by-faucet-service <vault>.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
near account create-account sponsor-by-faucet-service <ops>.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
```

## 2. Build and deploy the prize vault

```bash
sh contracts/prize-vault/build.sh
near contract deploy <vault>.testnet use-file contracts/prize-vault/target-wasm/wasm32-unknown-unknown/release/near_district_prize_vault.wasm \
  with-init-call new json-args '{"owner_id":"<vault>.testnet","operator_id":"<ops>.testnet","token_id":"usdc.fakes.testnet"}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send
# the vault must be registered with the token to receive prizes
near contract call-function as-transaction usdc.fakes.testnet storage_deposit json-args '{"account_id":"<vault>.testnet","registration_only":true}' \
  prepaid-gas '30 Tgas' attached-deposit '0.0125 NEAR' sign-as <ops>.testnet network-config testnet sign-with-legacy-keychain send
```

## 3. Configure the app

```
VAULT_CONTRACT_ID=<vault>.testnet
OPERATOR_ACCOUNT_ID=<ops>.testnet
OPERATOR_PRIVATE_KEY=ed25519:...        # from ~/.near-credentials/testnet/<ops>.testnet.json; a secret, never commit it
NEXT_PUBLIC_TESTNET_USDC_CONTRACT=usdc.fakes.testnet
NEXT_PUBLIC_TESTNET_USDC_SYMBOL=USDC.e
```

The web app reads the vault and verifies deposits. The worker signs `finalize`, `payout` and refunds with the operator key.

## 4. Demo data with real on-chain prizes

```bash
pnpm --filter @near-district/web seed:demo            # WARMUP_MINUTES=8 by default
```

With `VAULT_CONTRACT_ID` set, the seed:
1. opens an escrow for each demo mission from that company's wallet;
2. deposits the prize in testnet USDC;
3. publishes the mission through the normal publish check, which verifies the deposit on-chain.

It also adds a warm-up mission that ends a few minutes later, with the Demo Explorer's correct answers locked in.
Start the worker, and after the deadline it pays the Demo Explorer's wallet on-chain:

```bash
cd apps/worker && npx tsx --env-file=../../.env.local src/main.ts
```

Company wallets need testnet USDC (`usdc.fakes.testnet` has an open `mint`) and a token registration.
