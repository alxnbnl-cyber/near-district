# Mainnet readiness: prize vault

Real money only after an independent audit of `contracts/prize-vault` and your explicit approval. Until then the vault runs on testnet only (see `testnet-deploy.md`).

## Before deploying

- [ ] Audit of `contracts/prize-vault` (all of `src/lib.rs`; focus: `ft_on_transfer` checks, `finalize` share maths, payout and refund callbacks, the sponsor's safety refund).
- [ ] Owner is a multisig. The operator is a separate account whose key lives in the platform secret manager.
- [ ] Prize token is native USDC on NEAR: `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`.
- [ ] Reproducible build recorded: `sh contracts/prize-vault/build.sh`, then `sha256sum` the wasm.

## Deploy and smoke test (small amounts)

```bash
near contract deploy $VAULT use-file contracts/prize-vault/target-wasm/wasm32-unknown-unknown/release/near_district_prize_vault.wasm \
  with-init-call new json-args "{\"owner_id\":\"$OWNER\",\"operator_id\":\"$OPERATOR\",\"token_id\":\"$USDC\"}" \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config mainnet sign-with-keychain send
```

1. Register the vault with the token (`storage_deposit`).
2. Create a mission with a deadline a few minutes away, and fund it with 1 USDC.
3. After the deadline, `finalize` with one test winner, then `payout`, and check the winner received the share.
4. Create a second mission and finalize it with no winners. Check the sponsor got the full amount back through `withdraw_refund`.
5. Point `VAULT_CONTRACT_ID`, `OPERATOR_ACCOUNT_ID` and `OPERATOR_PRIVATE_KEY` at mainnet, then run the worker.
