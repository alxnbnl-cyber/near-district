# Vault contract (`contracts/vault`)

## Option A vs Option B

| | A: vault per campaign | **B: shared vault, isolated accounting (chosen)** |
|---|---|---|
| Asset segregation | Strong (separate accounts) | Logical: per-campaign buckets + exact RHEA share slices |
| Security surface | N deployments, but same code | One contract, one audit |
| Gas / storage | ~3–4 NEAR code storage per campaign | One campaign record (~0.01 NEAR, paid by sponsor) |
| Upgrades | Must coordinate N contracts | One timelocked upgrade |
| RHEA position | One per campaign (clean) | One for the vault; campaigns own measured share slices |
| Ops for one person | Heavy | Manageable |

The main argument for A is blast radius. We mitigate it in B with serialized RHEA operations, measured (not assumed) share accounting, invariant checks, pause levels, and a hard rule that tokens can only leave to the sponsor, a Merkle-proven claimant, RHEA, or the fee recipient (fees only).

## State per campaign

`principal_idle, principal_supplied, rhea_shares, yield_available, bonus_available, reserved, claimed_total, yield_realized_total, max_operator_reserve_per_period, require_sponsor_finalize, random_enabled`.

## Asynchrony and safety

- One in-flight RHEA operation (`pending_op`) at a time, so every share movement is attributable.
- Supply: token's `ft_resolve_transfer` result is authoritative for how much moved; shares are measured via `get_account` + `get_asset` in a chained callback.
- Withdraw: two-phase. RHEA sends tokens with a detached `ft_transfer`, so the vault never credits in the same chain. `reconcile_pending` (≥6 blocks later, worker waits for FINAL) measures burned shares. If shares are unchanged, nothing is credited. If the burn differs from the expected amount by >1%, the op is **flagged**, inflows pause, and the lock is kept for a human.
- Callbacks are `#[private]` (only the vault itself can call them). Every failed transfer callback restores buckets exactly.
- 256-bit intermediate mul-div; overflow checks on in release.

## Events

NEP-297 `EVENT_JSON` with standard `yielvy_vault`. Every bucket movement is reconstructable from events (`packages/near/src/vault.ts#ledgerMovesForEvent`).

## Tests (`cargo test`, 45 passing)

Funding allowlist, sponsor-only funding, pause, storage deposits, supply success / partial refund / transfer failure / share mismatch, serialization, harvest excess-only, no-yield abort, liquidity abort, failed withdrawal, view-failure retry, full redemption split, operator cap, unrealized-yield rejection, finalize excess return, allocation > reserve, sponsor-finalize mode, seed-after-commit + single seed, dispute window, valid claim + double claim, redirected claim, inflated claim, failed claim revert + retry, expiry, veto rules, close-period return, sponsor exit rules, reserved funds untouchable, owner cannot withdraw, failed sponsor transfer restore, fee cap, guardian cannot unpause, full pause blocks claims, upgrade timelock, init guards, 256-bit math, Merkle vector shared with TypeScript.

**Not yet covered:** end-to-end execution against a real RHEA deployment (testnet/mainnet procedure in `docs/operations/mainnet-verification.md`), and `near-workspaces` sandbox tests (sandbox binaries are Linux/macOS only; run them in CI or the Docker `contract-tests` service).

## Build & deploy (requires your approval — never automated)

```bash
cargo install cargo-near            # once
cd contracts/vault && cargo near build reproducible-wasm
```

Deployment, initialization arguments and post-deploy checks are in `docs/operations/mainnet-verification.md`.
