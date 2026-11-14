# NEAR District architecture

Product: [PRODUCT.md](../PRODUCT.md) · Reward rules: [ECONOMICS.md](../ECONOMICS.md) · Full technical reference: [NEAR-DISTRICT-SYSTEM.md](../NEAR-DISTRICT-SYSTEM.md)

NEAR District has two layers that are deliberately kept apart:

| Layer | Purpose | Where |
|---|---|---|
| **Exploration** | The district map, company destinations, missions, hints, expeditions, participation | `apps/web` (Next.js + PixiJS), PostgreSQL |
| **Financial** | Fixed-prize escrow and automatic equal-share payouts | `contracts/prize-vault` (NEAR, Rust), `apps/worker` |

The database is an operational index. It never decides who owns funds: the prize vault contract does.

```
 apps/web (Next.js 16)          apps/worker (Node)            contracts/prize-vault (Rust, NEAR)
 ├─ world map (PixiJS)          ├─ Postgres job queue         ├─ per-mission escrow
 ├─ API routes (CSRF, zod)      ├─ payout driver ───────────▶ ├─ finalize: equal shares
 ├─ mission engine              ├─ vault reconciliation       ├─ batched automatic payouts
 └─ wallet (user-signed txs) ─┐ └─ ledger + hint re-checks    └─ refunds to the sponsor
 packages/core  (pure domain: money, rewards, activities, state machines, world layout)
 packages/db    (Drizzle schema, migrations, append-only triggers)
 packages/near  (RPC, NEAR activity checks, NEP-413, prize vault client and events)
```

## Key decisions

| Decision | Choice | Why |
|---|---|---|
| Vault design | **One escrow contract, one record per mission** | Fixed prizes only: the deposit is exactly what winners share. Equal shares and payout destinations are enforced on-chain. See [prize-vault.md](prize-vault.md). |
| Upgrades | **No upgrade path in the contract** | Redeploying code keeps state when the layout is unchanged. An audited version is required before mainnet. |
| Job system | **Postgres queue** (`SKIP LOCKED`) instead of Redis | Jobs commit atomically with the business change; one less stateful service. |
| World renderer | **PixiJS v8 on a painted 2D map** | Crisp at any zoom, small downloads, runs on phones. |
| Auth | **NEAR wallet sign-in only** (NEP-413, MyNearWallet and Meteor) | No embedded wallets, no custodial keys. Ownership = signature + full-access-key check on-chain. |
| Answers | **Sealed**: HMAC-checked and AES-GCM-encrypted server-side, scored at the deadline | Players can't probe for right answers; correctness is never sent to the browser early. |
| Hint verification | **Indexer for discovery, RPC for proof** | NearBlocks finds candidate transactions; the final outcome is re-read from (archival) RPC before a hint unlocks. See [hints-and-expeditions.md](hints-and-expeditions.md). |
| Local DB / tests | Docker Postgres for dev, **PGlite** (real Postgres in WASM) for tests | Real SQL semantics (constraints, triggers, row locks) without infrastructure. |

## How money flows

1. **Open the escrow.** The project's wallet calls `create_mission(deadline)` on the vault (0.01 NEAR storage). Only that wallet can fund it or receive refunds.
2. **Deposit.** `ft_transfer_call(vault, amount, {"mission_id"})` on the prize token. The vault rejects any other token, any other sender, or a deposit after the deadline; the token contract then refunds automatically.
3. **Publish.** The app reads the mission from the chain and allows publishing only when the deposited prize is at least the planned amount and the deadlines match.
4. **Play.** Players join, lock in sealed answers and unlock hints. Nothing here touches funds.
5. **Settle.** After the deadline the worker scores answers, freezes the winner list, and calls `finalize`. The contract fixes `share = floor(prize / winners)`.
6. **Pay.** The worker pushes `payout` batches (10 transfers each) and retries failures. Each share goes straight to a winner's NEAR wallet.
7. **Refund.** The rounding remainder, or the whole prize if nobody qualified, returns to the sponsor. If a mission is never settled, the sponsor can reclaim it 14 days after the deadline.

Reward rules and fees: [ECONOMICS.md](../ECONOMICS.md).

## Worker jobs

| Job | When | What it does |
|---|---|---|
| `campaign.tick` | every 60 s | Queues a payout job for each mission period whose deadline has passed |
| payout driver | per mission | Freeze winners → `finalize` → `payout` batches → retries → remainder refund (or no-winner refund) |
| `vault.snapshot` | every 120 s | Records vault and mission state for the dashboards |
| `vault.reconcile` | every 10 min | Checks the vault's token balance covers every mission's unpaid prize |
| `ledger.index` | every 120 s | Builds the ledger from vault events only |
| `hints.reconcile` | every 60 s | Re-checks pending on-chain hint verifications; gives up with a reason after 60 attempts |

## Trust model (who can do what)

| Role | Can | Cannot |
|---|---|---|
| Sponsor (project wallet) | Open and fund its own missions; receive refunds; reclaim an unsettled prize after the grace period | Touch other missions; take back a prize before the deadline |
| Operator (`neardistrict-ops.testnet`, worker only) | Post the winner list once per mission after the deadline; drive payouts | Change share size, pay anyone twice, pay before the deadline, send funds anywhere except winners or the sponsor |
| Owner (vault account) | Rotate the operator (`set_operator`) | Move mission funds |
| Anyone | Trigger `payout`, `retry_payouts` and `withdraw_refund` (funds still go only to winners or the sponsor) | Change recipients or amounts |

Residual trust: the operator decides *who* solved every secret, because answers are sealed off-chain until the deadline. Mitigations: the share size, payout destinations and timing are enforced on-chain, the winner list can be posted only once, and the sponsor can always reclaim an unsettled prize.
