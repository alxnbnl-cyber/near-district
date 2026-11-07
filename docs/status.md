# Release status (honest)

Legend: ✅ implemented and tested here · 🟡 implemented, not verified end-to-end against live chain · ⛔ not done / blocked

| Acceptance criterion | Status | Evidence / blocker |
|---|---|---|
| Public exploration world renders and works | ✅ | PixiJS world with districts, buildings, signs, open plots, search/filter, panel, keyboard, list view; verified in browser |
| Real Spaces appear as interactive buildings | ✅ | Approved Spaces only; deterministic, collision-free plots (unit-tested) |
| Organizations can create and manage Spaces | ✅ | Wallet-gated onboarding, settings, uploads, admin approval; integration + browser tested |
| Treasure Hunt can be created and completed | ✅ | Builder (3 question types, reorder, preview), publish, play; tested + full browser run |
| Creative Contest accepts and reviews submissions | ✅ | Submit, weighted review history, shortlist/reject, winners after deadline, CSV; integration tested |
| Participation stored and verified server-side | ✅ | Row-locked progress, current-question enforcement, attempts/cooldowns |
| Reward selection rules enforceable | ✅ / 🟡 | Allocation engine unit-tested; on-chain caps/limits contract-tested; live chain run pending |
| Users authenticate securely | ✅ / 🟡 | Email magic link verified in browser; NEP-413 verification unit-tested; **real wallet sign-in not exercised** (needs a real wallet) |
| Organizers authenticate and authorize transactions | 🟡 | Step-up + user-signed tx plans + on-chain verification implemented; not exercised with a real wallet |
| Native NEAR campaign funding works | 🟡 | Contract tested; UI + verification implemented; **vault not deployed** (needs your approval) |
| RHEA integration verified against real contracts | 🟡 | Contract addresses, methods, decimals, views verified live (read-only); supply/withdraw not executed live |
| Supply and withdrawal workflows work | 🟡 | Contract tests incl. failure paths; live run pending |
| Financial records reconcile with on-chain state | 🟡 | Reconciliation job + invariants implemented; no live vault to reconcile yet |
| Actual realized yield accounting correct | 🟡 | Contract tests; live yield needs time + deployment |
| Direct bonus reward funding works | 🟡 | Contract tests; live pending |
| Rewards cannot exceed reserved funds | ✅ | Contract (`ERR_ALLOCATION_EXCEEDS_RESERVE`, overclaim checks) + engine invariants tested |
| Double claims prevented | ✅ | Contract tests (double claim, replay, redirect, inflation) |
| Real reward claims work on NEAR | 🟡 | Claim tx builder + on-chain confirmation implemented; live pending |
| At least one cross-chain funding route works | 🟡 | Live 1Click token list + **real dry quote** (Base USDC→NEAR USDC) verified; no real bridged deposit executed |
| Failed/refunded/pending operations handled | ✅ / 🟡 | State machines + contract failure tests + worker retries/dead-letter; live pending |
| Sponsor exit flow within disclosed constraints | 🟡 | Contract tested; tx plans in UI; live pending |
| Organizer dashboard displays real data | ✅ | Records labelled "Recorded", chain figures labelled "On-chain", honest "not deployed" state |
| Admin has operational controls | ✅ | Approvals, holds, reports, suspensions, vault status, dead jobs, audit log |
| Responsive desktop and mobile | ✅ / 🟡 | List-first on phones, touch pan/pinch; checked at desktop size in browser; dedicated device testing pending |
| Security tests implemented | ✅ | Contract permission/claim tests, CSRF/replay checks, DB append-only tests, engine abuse tests |
| End-to-end tests pass | 🟡 | Full hunt flow driven manually in the browser; automated Playwright suite not written yet |
| Deployment setup documented | ✅ | `docs/deployment`, Dockerfiles, compose, env example, health checks |
| Real-money verification procedure documented | ✅ | `docs/operations/mainnet-verification.md` |
| No fake financial data presented as real | ✅ | No seeded balances; estimates labelled; dev seed refuses non-local DBs |
| No unfinished features advertised as live | ✅ | Product Explorer / More experiences shown as "Coming soon", non-interactive |
| External security review requirements documented | ✅ | `docs/security/threat-model.md` |
| Jurisdiction/compliance launch gates documented | ✅ | `docs/compliance/launch-gates.md` |

## Known gaps / next steps
1. Deploy the vault to **testnet** with a RHEA testnet deployment and run the lifecycle (needs: your accounts, approval).
2. Automated Playwright E2E suite (explore → hunt → contest → winners → claim).
3. Real wallet sign-in test (MyNearWallet redirect + Meteor) on a real account.
4. 1Click quote-signature verification (public key / payload from official docs).
5. Sanctions screening for sponsor/winner wallets before payouts.
6. Teammate invitations (editor/reviewer roles exist in the schema and authz, UI not built).
7. Visible-pane FPS measurement on target devices (scene logic measured at ~0.1 ms/frame with 30 buildings).
