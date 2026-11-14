# Keys and roles

| Key | Holder | Type | Used for |
|---|---|---|---|
| Vault **owner** | Testnet: the vault account. Mainnet: a multisig (2 of 3 hardware wallets recommended) | Full access | `set_operator` (rotate the operator) |
| Vault account (`neardistrict-vault.testnet`) | Deployer | Full access | Deploying the contract code. Remove full-access keys after a mainnet deploy |
| **Operator** (`neardistrict-ops.testnet`) | Worker only (`OPERATOR_PRIVATE_KEY` in the secret manager) | Full access on a dedicated account, because `finalize` and token registrations attach small NEAR deposits | `finalize`, `payout`, `retry_payouts`, `withdraw_refund`, winner `storage_deposit` |
| Demo company wallets (`*.neardistrict-host.testnet`) | Operator, for seeding the testnet demo only | Full access | `create_mission` and prize deposits for demo missions |
| Users and organizers | Their own wallets | — | NEAR District never sees or stores them |

Rules
- No private key is ever committed, logged, or placed in a `NEXT_PUBLIC_*` variable. The web app holds **no** keys; only the worker holds the operator key.
- Rotate the operator with `set_operator` (owner), then delete the old key from the old operator account.
- Keep the operator account funded only for gas and per-winner deposits (alert below 2 NEAR).
- Production secrets (`OPERATOR_PRIVATE_KEY`, `ANSWER_PEPPER`, `ANSWER_ENCRYPTION_KEY`, `IP_HASH_SALT`, database URL) live in the hosting platform's secret manager, never in `.env` files that are committed.
- `ANSWER_PEPPER` and `ANSWER_ENCRYPTION_KEY` must stay the same for the life of a mission; changing them makes existing answers unverifiable.
