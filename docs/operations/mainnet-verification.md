# Small-value mainnet verification

**Do not run any step without explicit approval from the owner.** Use amounts you are prepared to lose (e.g. 5 USDC principal, 2 USDC bonus, ~3 NEAR for storage/gas). Install `near` CLI (near-cli-rs) and `cargo-near`.

Placeholders: `VAULT=yielvy-vault.<you>.near`, `OWNER=<multisig>.near`, `OPERATOR=yielvy-operator.<you>.near`, `GUARDIAN=yielvy-guardian.<you>.near`, `SPONSOR=<your wallet>.near`, `USDC=17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`, `RHEA=contract.main.burrow.near`.

## 0. Preflight (read-only)
```bash
pnpm verify:live
pnpm test && pnpm test:contract
```

## 1. Build and deploy the approved contract
```bash
cd contracts/vault && cargo near build reproducible-wasm
sha256sum target/near/yielvy_vault.wasm        # record this hash
near account create-account fund-myself $VAULT '4 NEAR' autogenerate-new-keypair save-to-keychain sign-as <funder>.near network-config mainnet sign-with-keychain send
near contract deploy $VAULT use-file target/near/yielvy_vault.wasm with-init-call new json-args "{\"owner_id\":\"$OWNER\",\"operator_id\":\"$OPERATOR\",\"guardian_id\":\"$GUARDIAN\",\"token_id\":\"$USDC\",\"lending_id\":\"$RHEA\",\"extra_decimals\":12,\"fee_bps\":1000,\"fee_recipient\":\"$OWNER\",\"safety_buffer_bps\":50,\"dispute_window_ns\":\"86400000000000\",\"upgrade_timelock_ns\":\"259200000000000\"}" prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config mainnet sign-with-keychain send
```

## 2. Verify the deployment
```bash
near contract call-function as-read-only $VAULT get_config json-args {} network-config mainnet now
near account view-account-summary $VAULT network-config mainnet now
```
Check owner/operator/guardian/token/lending/extra_decimals exactly. Then **remove the vault's full-access key** (only after verifying):
```bash
near account delete-keys $VAULT public-keys <vault-pubkey> network-config mainnet sign-with-keychain send
```

## 3. Register storage
```bash
near contract call-function as-transaction $USDC storage_deposit json-args "{\"account_id\":\"$VAULT\",\"registration_only\":true}" prepaid-gas '30 Tgas' attached-deposit '0.00125 NEAR' sign-as $SPONSOR network-config mainnet sign-with-keychain send
near contract call-function as-transaction $RHEA storage_deposit json-args "{\"account_id\":\"$VAULT\"}" prepaid-gas '30 Tgas' attached-deposit '0.1 NEAR' sign-as $SPONSOR network-config mainnet sign-with-keychain send
```

## 4–6. Create campaign and fund (from the Yielvy UI or CLI)
```bash
near contract call-function as-transaction $VAULT create_campaign json-args '{"max_operator_reserve_per_period":"2000000","require_sponsor_finalize":false,"random_enabled":false}' prepaid-gas '30 Tgas' attached-deposit '0.02 NEAR' sign-as $SPONSOR network-config mainnet sign-with-keychain send
near contract call-function as-transaction $USDC ft_transfer_call json-args "{\"receiver_id\":\"$VAULT\",\"amount\":\"5000000\",\"msg\":\"{\\\"action\\\":\\\"fund_principal\\\",\\\"campaign_id\\\":\\\"1\\\"}\"}" prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' sign-as $SPONSOR network-config mainnet sign-with-keychain send
near contract call-function as-transaction $USDC ft_transfer_call json-args "{\"receiver_id\":\"$VAULT\",\"amount\":\"2000000\",\"msg\":\"{\\\"action\\\":\\\"fund_bonus\\\",\\\"campaign_id\\\":\\\"1\\\"}\"}" prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' sign-as $SPONSOR network-config mainnet sign-with-keychain send
near contract call-function as-read-only $VAULT get_campaign json-args '{"campaign_id":"1"}' network-config mainnet now   # expect principal_idle 5000000, bonus 2000000
near contract call-function as-read-only $USDC ft_balance_of json-args "{\"account_id\":\"$VAULT\"}" network-config mainnet now  # expect 7000000
```

## 7–9. Supply to RHEA and verify shares
```bash
near contract call-function as-transaction $VAULT supply json-args '{"campaign_id":"1","amount":"5000000"}' prepaid-gas '300 Tgas' attached-deposit '0 NEAR' sign-as $SPONSOR network-config mainnet sign-with-keychain send
near contract call-function as-read-only $RHEA get_account json-args "{\"account_id\":\"$VAULT\"}" network-config mainnet now
near contract call-function as-read-only $VAULT get_campaign json-args '{"campaign_id":"1"}' network-config mainnet now
near contract call-function as-read-only $VAULT check_invariants json-args '{}' network-config mainnet now
```
`rhea_shares` must equal RHEA's `supplied[].shares` for the vault; `principal_supplied` = 5000000.

## 10–11. Real yield (do not fake it)
5 USDC at ~9 % earns ~0.0012 USDC/day. Wait at least 7–14 days, or skip and verify yield settlement later. Then:
```bash
near contract call-function as-transaction $VAULT harvest_yield json-args '{"campaign_id":"1","min_amount":"1"}' prepaid-gas '300 Tgas' attached-deposit '0 NEAR' sign-as $SPONSOR network-config mainnet sign-with-keychain send
# wait for FINAL (≥6 blocks), then
near contract call-function as-transaction $VAULT reconcile_pending json-args '{}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' sign-as $SPONSOR network-config mainnet sign-with-keychain send
```
Expect a `withdraw_settled` event; `yield_available` = received − 10 % fee. If it logs `no_harvestable_yield`, the buffer (0.5 %) has not been exceeded yet — that is correct behaviour.

## 12–14. Reward from the bonus pool and claim with a real wallet
Publish a campaign in the UI with funding "Direct budget", complete it from a second wallet, let the worker freeze → commit → reserve → finalize. After the dispute window, claim from **My Rewards**. Verify:
```bash
near contract call-function as-read-only $VAULT is_claimed json-args '{"campaign_id":"1","period_id":1,"account_id":"<winner>.near"}' network-config mainnet now
near contract call-function as-read-only $USDC ft_balance_of json-args '{"account_id":"<winner>.near"}' network-config mainnet now
```

## 15–17. Sponsor exit and final reconciliation
```bash
near contract call-function as-transaction $VAULT redeem_principal json-args '{"campaign_id":"1","amount":"5000000"}' prepaid-gas '300 Tgas' attached-deposit '0 NEAR' sign-as $SPONSOR network-config mainnet sign-with-keychain send
near contract call-function as-transaction $VAULT reconcile_pending json-args '{}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' sign-as $SPONSOR network-config mainnet sign-with-keychain send
near contract call-function as-transaction $VAULT begin_wind_down json-args '{"campaign_id":"1"}' prepaid-gas '20 Tgas' attached-deposit '0 NEAR' sign-as $SPONSOR network-config mainnet sign-with-keychain send
near contract call-function as-transaction $VAULT sponsor_withdraw json-args '{"campaign_id":"1","principal":"<principal_idle>","yield_amount":"<yield_available>","bonus":"<bonus_available>"}' prepaid-gas '60 Tgas' attached-deposit '0 NEAR' sign-as $SPONSOR network-config mainnet sign-with-keychain send
near contract call-function as-read-only $VAULT check_invariants json-args '{}' network-config mainnet now
```
Finally run the worker's `vault.reconcile` (or check the admin portal): it must report `ok`, with token balance ≥ tracked liquidity and RHEA shares equal to the vault's tracked shares.
