# NEAR District architecture

NEAR District has two layers that are deliberately kept apart:

| Layer | Purpose | Where |
|---|---|---|
| **Exploration** | The 2.5D town, Spaces, hunts, contests, participation | `apps/web` (Next.js + PixiJS), Postgres |
| **Financial** | Fixed-prize escrow and automatic equal-share payouts | `contracts/prize-vault` (NEAR, Rust), `apps/worker` |

The database is an operational index. It never decides who owns funds: the prize vault contract does.

```
 apps/web (Next.js 16)          apps/worker (Node)            contracts/prize-vault (Rust, NEAR)
 ├─ world (PixiJS)              ├─ Postgres job queue         ├─ per-mission escrow
 ├─ API routes (CSRF, zod)      ├─ payout driver ───────────▶ ├─ finalize: equal shares
 ├─ campaign engine             ├─ vault reconciliation       ├─ batched automatic payouts
 └─ wallet (user-signed txs) ─┐ └─ ledger indexer             └─ refunds to the sponsor
 packages/core  (pure domain: money, rewards, state machines, world layout)
 packages/db    (Drizzle schema, migrations, append-only triggers)
 packages/near  (RPC, NEAR activity checks, NEP-413, prize vault events)
```

## Key decisions

| Decision | Choice | Why |
|---|---|---|
| Vault design | **One escrow contract, one record per mission** | Fixed prizes only: the deposit is exactly what winners share. Equal shares and payout destinations are enforced on-chain. See `prize-vault.md`. |
| Upgrades | **No upgrade path in the contract** | Redeploying code keeps state when the layout is unchanged. An audited version is required before mainnet. |
| Job system | **Postgres queue** (`SKIP LOCKED`) instead of Redis/BullMQ | Jobs commit atomically with the business change; one less stateful service for a solo operator. |
| World renderer | **PixiJS v8, procedural isometric 2D** | Crisp at any zoom, GPU-cached geometry, tiny downloads, runs on phones. Real 3D adds an asset pipeline for no gameplay benefit. |
| Auth | Email magic link + NEAR NEP-413 | No embedded wallets, no custodial keys. Ownership = signature + full-access-key check on-chain. |
| Cross-chain | 1Click delivers to the **organizer's own NEAR account**, then a native deposit | The vault only accepts attributed `ft_transfer_call` deposits from the campaign sponsor, so a bridge can never credit the wrong campaign. |
| Local DB / tests | Docker Postgres for dev, **PGlite** (real Postgres in WASM) for tests | Real SQL semantics (constraints, triggers, row locks) without infrastructure. |

## How money flows

1. **Organizer registers** a campaign in the vault from their own wallet (`create_campaign`). Only that wallet can fund or withdraw it.
2. **Deposit**: `USDC.ft_transfer_call(vault, amount, {"action":"fund_principal"|"fund_bonus","campaign_id"})`. The vault rejects any other token, any other sender, or a paused state (the token contract refunds automatically).
3. **Supply**: principal moves to RHEA via `ft_transfer_call(contract.main.burrow.near, amount, "")` — a plain supply, **not collateral**. The vault measures the share delta from RHEA itself and credits it to the campaign.
4. **Yield settlement** (`harvest_yield`): the vault reads RHEA's share price, values the campaign's shares, and withdraws **only value above principal + safety buffer**. Tokens are credited only after a later `reconcile_pending` confirms the shares were burned (cross-checked against the share price within 1%).
5. **Reserve → finalize → claim**: realized yield and/or direct budget is moved into a period reserve; winners are committed as a Merkle root; after a dispute window each winner claims with a proof bound to *their own* account.
6. **Exit**: idle principal is withdrawable any time; supplied principal returns via `redeem_principal` when RHEA has liquidity; budget/yield only after `begin_wind_down`. Reserved funds are untouchable.

## How sponsor principal is protected from reward spending

- Principal lives in `principal_idle` / `principal_supplied`. **No contract function moves principal into a reward reserve.** Reservations draw only from `yield_available` and `bonus_available`.
- Harvesting withdraws only *excess* value over principal (+ buffer), computed in-contract from RHEA state — not from operator input.
- A realized loss reduces `principal_supplied`; it is never papered over with other campaigns' money.
- Invariants (`check_invariants`): Σ buckets == `liquid_tracked`, Σ campaign shares == `total_rhea_shares`; the worker additionally checks token balance ≥ tracked liquidity and RHEA's reported shares == vault shares.

## How actual yield becomes rewards

`estimate` (UI only, labelled) → `harvest_yield` (withdraw excess) → `reconcile_pending` (measure) → `yield_available` (−fee) → `reserve_for_period` → `finalize_period` → `claim`. Nothing in this chain uses APY.

## Trust model (who can do what)

| Role | Can | Cannot |
|---|---|---|
| Sponsor | fund, reserve (uncapped), finalize (if required), veto, withdraw own unreserved funds | touch reserved funds or other campaigns |
| Operator (hot key, worker) | supply, harvest, commit/reserve (≤ sponsor cap)/seed/finalize, reconcile | transfer to arbitrary accounts, exceed caps, bypass the veto window |
| Guardian | pause, veto, cancel upgrades, clear a flagged op (no credit) | unpause, move funds |
| Owner (multisig) | config within hard caps, propose timelocked upgrades, withdraw platform fees only | withdraw sponsor funds, change recipients |

Residual trust: the operator chooses *which* allocation root to publish for objective modes. Mitigations: sponsor-set reservation cap, 24 h dispute window with sponsor/guardian veto, deterministic recomputation from the published snapshot (and on-chain seed for draws), and `require_sponsor_finalize` for organizer-judged contests.
