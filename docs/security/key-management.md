# Keys and roles

| Key | Holder | Type | Used for |
|---|---|---|---|
| Vault **owner** | Multisig (≥2 of 3 humans, hardware wallets) | Full access on the multisig | Config within caps, timelocked upgrades, fee withdrawal |
| Vault account | — | **Full-access keys removed after deploy** | The contract upgrades itself only via `apply_upgrade` |
| **Guardian** | On-call person, hardware wallet | Full access to a separate account | `pause`, `veto_period`, `cancel_upgrade`, `clear_flagged_op` |
| **Operator** | Worker (secret manager) | Function-call key on the operator account, restricted to the vault contract | Settlement, periods, reconcile |
| Users / organizers | Their own wallets | — | NEAR District never sees or stores them |

Rules
- No private key is ever committed, logged, or placed in a `NEXT_PUBLIC_*` variable. The web app holds **no** keys.
- Rotate the operator key via `set_operator` (owner) or by replacing the function-call key on the operator account.
- The operator account balance should hold only enough NEAR for gas (alert below 2 NEAR).
- Production secrets live in the hosting platform's secret manager, never in `.env` files on disk.
