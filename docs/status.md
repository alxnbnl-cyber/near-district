# Release status

NEAR District runs as a working **NEAR Testnet** deployment at https://neardistrict.quest/. All prize amounts are testnet USDC with no monetary value. Evidence: [DEMO.md](DEMO.md).

Legend: ✅ implemented and tested · 🟡 implemented, not fully verified · ⛔ not built

## Core product

| Area | Status | Evidence |
|---|---|---|
| District map with company destinations and mission pins | ✅ | PixiJS map; live on testnet; layout unit-tested |
| Company onboarding, profile and admin approval | ✅ | Wallet-gated host console; integration tests |
| Missions (Decrypt Secrets) with sealed answers | ✅ | Answers editable until the deadline, scored after it; integration tests and live play |
| Creative Challenges (submissions, review, team-selected winners) | ✅ | Integration tests |
| Participation stored and enforced server-side | ✅ | Row-locked entries, per-user, per-secret and per-IP save throttles, audited answer log |
| NEAR wallet sign-in (NEP-413, MyNearWallet and Meteor) | ✅ | Signature and full-access-key checks unit-tested; CSRF origin checks |
| Organizer-signed transactions (escrow, deposit, refunds) | ✅ testnet | Transaction plans signed in the project's wallet; outcomes re-read from the chain |
| Progress panel (rank, joined missions, paid rewards with tx links) | ✅ | Live on testnet |
| Responsive layout | ✅ / 🟡 | List-first on phones, touch pan and pinch; no dedicated device testing yet |

## Prize vault and rewards

| Area | Status | Evidence |
|---|---|---|
| Fixed-prize escrow per mission | ✅ testnet | `neardistrict-vault.testnet`; 15 contract tests |
| Publish blocked until the prize is on-chain | ✅ | Publish check reads `get_mission` (amount and deadline) |
| Equal-share settlement and automatic payout | ✅ testnet | Worker paid warm-up mission 22: 20 testnet USDC, tx `FYjZA8bnawFjxuruGiSeN4FkVzrK6LSXrPtxzMS3aq53` |
| Retries, remainder refund, no-winner refund | ✅ | Contract tests; worker suite against a simulated vault |
| Sponsor reclaim of an unsettled prize (14 days) | ✅ | Contract tests |
| Reconciliation of vault balance against unpaid prizes | ✅ testnet | `vault.reconcile` job |
| Ledger built only from vault events | ✅ | `packages/near/src/vault.ts` tests |

## Hints and cooperation

| Area | Status | Evidence |
|---|---|---|
| Hint engine (ANY / ALL, nested groups, versioned unlocks) | ✅ | `packages/core/src/activities.test.ts`, `packages/db/src/hint-engine.ts` |
| Internal verifiers (mission completion, quiz, question sequence, challenge entry) | ✅ | `apps/web/src/server/cooperation.test.ts` |
| Manual review (owner's team, no self-review, audited) | ✅ | Same suite |
| On-chain verifiers: contract call, RHEA swap, RHEA Lending supply, staking, Meteor sign-in | ✅ | Decoders tested against real finalized transactions (`packages/near/src/fixtures`); contract-call hint live on testnet |
| Partner hints (invitations, offerings, withdrawal policy) | ✅ | `cooperation.test.ts` |
| Free path required for financial hints in funded missions | ✅ | Publish check in `apps/web/src/server/hints.ts` |
| Expeditions (multi-project chapters, reward chapter, map route) | ✅ | `cooperation.test.ts` |
| Liquidity, holding, NFT, partner API, Meteor-swap activities | ⛔ | Shown as unavailable in the builder, with the reason |
| Multi-sponsor prizes | ⛔ | Not supported by the vault |

## Tests

135 automated tests: 15 contract tests (`docker compose run --rm contract-tests`) and 120 TypeScript tests (`pnpm test`): core 32, near 31, db 5, web 44, worker 8.

## Known gaps

1. Independent audit of `contracts/prize-vault` before any mainnet deployment.
2. Automated browser end-to-end suite (explore → mission → hint → results → payout).
3. Dedicated device testing on phones and low-end laptops.
4. Sanctions screening for sponsor and winner wallets before mainnet payouts.
5. Teammate invitations (editor and reviewer roles exist in the schema and authorization; no UI yet).
6. Automatic review holds for implausibly fast sealed-mission completions (the threshold is defined in `server/play.ts` but not yet applied when sealed answers are scored).
