# NEAR District: full system overview

**Explore. Play. Earn.** NEAR District is a game map of NEAR ecosystem projects. Projects host mystery missions with fixed prizes. Explorers decrypt sealed secrets, unlock hints through verified on-chain NEAR activity (often at a partner project), and everyone who solves every secret before the deadline shares the prize equally. The prize money is held and paid out by a smart contract on NEAR.

| | |
|---|---|
| Live site | https://neardistrict.quest |
| Repository | https://github.com/alxnbnl-cyber/near-district |
| Network | NEAR **testnet** (prizes in testnet USDC, no real value) |
| Prize vault contract | `neardistrict-vault.testnet` (operator `neardistrict-ops.testnet`) |
| Prize token | `usdc.fakes.testnet` (testnet USDC, symbol `USDC.e`, 6 decimals) |
| Proof of a live payout | tx `FYjZA8bnawFjxuruGiSeN4FkVzrK6LSXrPtxzMS3aq53`: the vault paid 20 USDC to the winner of the warm-up mission |

---

## 1. The product

### Who uses it

| Role | What they do |
|---|---|
| **Explorer (player)** | Signs in with a NEAR wallet, explores the map, joins missions, decrypts secrets, unlocks hints, and gets paid automatically if they solve every secret. |
| **Project (host / sponsor)** | Creates a company profile and its place on the map, builds missions (story, secrets, hints, prize, timeline), locks the prize in the vault, and launches. |
| **Partner project** | Offers an on-chain activity (for example "wrap NEAR") that other projects can use as a hint in their missions. This gives the partner new users and gives the host a richer mission. |
| **Admin** | Approves companies and missions, handles reports and holds, and watches the vault, reconciliation and jobs. |

### Core loop

1. **Discover:** an orange pin on the map is a mission, with its prize shown.
2. **Join:** one entry per person, free to play.
3. **Decrypt:** each mission has secrets (questions). Answers are **sealed**: you can change them any time, but you get **no right-or-wrong feedback** until the deadline.
4. **Unlock hints:** a hint unlocks when you make a qualifying **contract function call on NEAR** from your own wallet. Hints for secrets 2 and 3 usually point to a **partner project's** activity, so one mystery leads you to another project.
5. **Deadline:** answers are scored, and players who solved **every** secret qualify.
6. **Payout:** the prize vault splits the fixed prize **equally** among qualified players and sends each share **straight to their NEAR wallet**. There's no claim step.

### Design principles

- **Fixed prizes, equal shares.** No speed bonus, no wallet-size or trading-volume advantage, no random draw.
- **Hints, not rewards.** On-chain activity only unlocks clues; more transactions never increase your share.
- **Sealed answers.** No instant feedback, so you can't brute-force answers by repeated guessing. This reduces simple trial-and-error abuse; it does not make the game bot-proof.
- **The chain is the source of truth for money.** Prizes are verified on-chain before a mission can launch, and payouts are made by the contract.
- **Free path to every hint.** On funded missions, a hint can't require a *financial* activity unless a free alternative exists (no pay-to-win).

---

## 2. Architecture

```
                 ┌──────────────────────────────── Railway ────────────────────────────────┐
 Browser ──HTTPS──▶  apps/web (Next.js 16)                 apps/worker (Node, tsx)            │
 (PixiJS map,     │   • pages: map, missions, host console  • Postgres job queue (SKIP LOCKED) │
  NEAR wallets)   │   • API routes (zod, CSRF, rate limits) • payout driver, sealed scoring    │
                  │   • NEP-413 wallet sign-in              • hint re-verification, ledger     │
                  │            │                              │ prize snapshots, reconciliation │
                  │            └──────────── Postgres ────────┘                                 │
                  └─────────────────────────────────────────────────────────────────────────────┘
                               │ reads / verifies                    │ signs (operator key)
                               ▼                                     ▼
                     NEAR testnet RPC · NearBlocks indexer    contracts/prize-vault (Rust)
                                                              usdc.fakes.testnet (NEP-141)
```

### Monorepo

| Path | Role |
|---|---|
| `apps/web` | Next.js 16 app: PixiJS world map, explorer UI, host console, admin, all API routes |
| `apps/worker` | Background worker: durable Postgres job queue and every scheduled or financial process |
| `packages/core` | Pure domain logic: money (bigint), answer normalisation, equal-split rules, state machines, world layout, activity catalogue |
| `packages/db` | Drizzle schema, migrations, append-only triggers, sealed scoring, hint engine |
| `packages/near` | NEAR RPC client, NEP-413 signature verification, contract-call activity verifier (NearBlocks and archival RPC), prize vault client and events |
| `contracts/prize-vault` | The prize escrow smart contract (Rust, near-sdk 5) |
| `docs/` | Architecture, security, operations, deployment, status |
| `video/` | Hackathon video production (not committed) |

### Key data (Postgres)

- **Identity:** `users`, `walletConnections` (verified NEAR accounts, one payout wallet per network), `sessions` (hashed tokens), `authChallenges`.
- **Projects:** `organizations`, `spaces` (the company's place on the map), `uploads` (logos and images).
- **Missions:** `campaigns`, `campaignVersions` (immutable published rules), `treasureQuestions`, `treasureAnswerRules` (encrypted), `participantEntries`, `sealedAnswers` (encrypted answers plus a correctness flag), `qualifications`.
- **Hints and cooperation:** `treasureHints` (unlock rules), `organizationPartnerships`, `activityOfferings`, `activityVerifications`, `activityCompletions`, `hintUnlocks`, `expeditions*` (multi-project journeys).
- **Money:**
  - `fundingOrders`, `chainTransactions` (verified txs with parsed vault events), `ledgerEntries` (append-only, built only from vault events);
  - `rewardPeriods`, `eligibilitySnapshots` (immutable), `rewardAllocations`, `rewardClaims`;
  - `vaultPositions` (prize snapshots), `blockchainOperations` (idempotent operator calls), `reconciliationRuns`.
- **Ops:** `jobs`, `notifications`, `auditLogs`, `rateLimits`, `moderationReports`.

---

## 3. How each part works

### 3.1 Sign-in and wallets

- **NEP-413 wallet sign-in:** the server issues a challenge (`/api/auth/near/challenge`), the wallet signs it, and the server verifies the signature and that the key belongs to the account (`/api/auth/near/verify`). Supported wallets include MyNearWallet and Meteor.
- **Sessions:** an http-only cookie (`yv_session`) whose token is stored only as a SHA-256 hash, with expiry and revocation.
- **Step-up:** sensitive host money actions require a fresh wallet proof.
- **Payout wallet:** prizes go to the wallet the player signed in with.

### 3.2 Map and discovery

- PixiJS renders the fictional district: districts, buildings, roads, and mission pins with prizes and logos.
- Mission data and prizes come from the database plus on-chain prize snapshots. The map never shows a form-field amount as a real prize.
- A mission modal shows the briefing, prize pool, timeline, rules, company info and the decrypt view.

### 3.3 Hosting a mission (project side)

1. **Company profile:** name, category, logo, website. An admin approves it.
2. **Story:** mission name, one-line hook and description.
3. **Secrets:** questions with answers. Answers are stored as salted HMAC digests (and encrypted rules) with a server-side pepper, and are never stored in plain text.
4. **Hints:** each hint has an unlock rule, a tree of activities (`ANY` / `ALL`). The usual activity is a NEAR contract function call, either the host's own or a partner's offering.
5. **Prize:** a fixed amount in USD (testnet USDC).
6. **Timeline and launch:** start and end dates, then a launch checklist.
7. **Funding (Host console → Funding):**
   - *Open the prize vault*: the project's wallet calls `create_mission(deadline)` and attaches 0.01 NEAR for storage.
   - *Deposit the prize*: the project's wallet calls `ft_transfer_call` on the USDC token to the vault, with `{"mission_id": …}`.
   - The server confirms each step by reading the transaction from the chain and finding the vault event (`mission_created`, `prize_funded`). A client-reported hash alone proves nothing.
8. **Publish:** the publish check reads the mission from the vault. The prize must be deposited, at least the planned amount, with the same deadline. Only then does the mission go live.

### 3.4 Playing (explorer side)

- **Join** (`/api/campaigns/[id]/join`): one entry per person, with eligibility checks (payout wallet, jurisdiction rules).
- **Answer / lock in** (`/api/campaigns/[id]/answer`): the answer is normalised, checked against the encrypted rule, and stored encrypted (`sealedAnswers`) with its correctness flag. The player only sees "sealed". They can change it until the deadline.
- **Hints** (`/hints/[hintId]/verify`): the player taps "I did it". The verifier then checks four things:
  1. **Candidate transactions:** it finds candidates for the player's wallet via the NearBlocks indexer.
  2. **Finality:** it confirms the transaction outcome via archival RPC.
  3. **Match:** signer = the player's wallet, receiver = the configured contract, method = the configured function, status = success.
  4. **Unlock:** if all three hold, the hint decrypts.

  It detects a qualifying function call; it does not claim to verify a full swap or bridge outcome.

### 3.5 Cross-project collaboration

- A partner publishes an **activity offering**, for example "Wrap NEAR into wNEAR" (`wrap.testnet::near_deposit`).
- A host uses that offering as the unlock for a hint, usually on secrets 2 and 3.
- In the app, locking secret 1 and opening secret 2 moves the camera across the map to the partner's pin (the "partner jump"), and shows the partner's quest card with an "Open NEAR ↗" link.
- When the partner withdraws its offering, hosts are warned, and publishing is blocked for hints that depend on it.
- Value: explorers discover new projects; partners get real users making real on-chain actions; hosts get richer missions.
- The demo partnerships (RHEA, NEAR, LiNEAR, NEAR Social) are **examples**, not official partnerships.

### 3.6 Deadline, scoring, payout (worker)

The worker runs a **payout driver** per funded reward period. Every step is idempotent and re-reads both the database and the chain, so retries are always safe.

```
SCHEDULED ──(deadline passed)──▶ ELIGIBILITY_FROZEN   score sealed answers; freeze winners
                                                      (everyone who solved every secret, with a payout wallet)
ELIGIBILITY_FROZEN ────────────▶ FUNDS_RESERVED       register winners with the token if needed;
                                                      vault.finalize(mission, winners) fixes equal shares on-chain
                               ╰▶ NO_WINNERS          finalize(mission, []) → withdraw_refund: the whole prize goes back
FUNDS_RESERVED ────────────────▶ COMPLETED            vault.payout in batches of 10, retry failed transfers,
                                                      refund the rounding remainder, mark each reward paid with its tx hash
```

- Sealed answers are scored by the payout job itself before freezing winners. A winner can't be missed because a separate tick hadn't run yet; there's a regression test for that race.
- Players see **Paid** in My Rewards, with a link to the real transaction.

### 3.7 Other worker jobs

| Job | Every | What it does |
|---|---|---|
| `campaign.tick` | 60 s | Moves missions SCHEDULED → LIVE → ENDED, scores sealed hunts, and queues payout jobs for periods past their deadline |
| `rewards.period` | on demand | The payout driver above |
| `hints.reconcile` | 60 s | Re-runs pending hint verifications (finality, recovery) |
| `ledger.index` | 120 s | Turns verified vault events into append-only ledger rows |
| `vault.snapshot` | 120 s | Records each mission's on-chain prize for the map and mission pages |
| `vault.reconcile` | 600 s | Checks that the vault's token balance covers every mission's unpaid prize; alerts admins on a discrepancy |
| `maintenance.prune` | 1 h | Prunes old rate-limit rows and finished jobs |

The health endpoint (`HEALTH_PORT`, default 8081) and `/api/health` on the web app report liveness.

---

## 4. The prize vault contract (`contracts/prize-vault`)

A small escrow with **no lending, no yield and no fees**. The prize a project deposits is exactly what winners share.

### Lifecycle and methods

| Method | Who | Effect |
|---|---|---|
| `new(owner_id, operator_id, token_id)` | deploy | One accepted prize token per deployment |
| `create_mission(deadline_ns)` | sponsor, attaches 0.01 NEAR | Opens a mission escrow → `Open` |
| `ft_on_transfer` (via `ft_transfer_call`) | the token, sender must be the sponsor | Adds to the prize, only before the deadline. Anything invalid panics, so the token refunds it. |
| `finalize(mission_id, winners)` | operator, after the deadline, attaches 0.0015 NEAR per winner | Fixes `share = floor(prize / winners)`, rejects duplicates → `Paying`; no winners → `Refunded` |
| `payout(mission_id)` | anyone | Sends the next 10 shares; recipients and amounts are already fixed |
| `retry_payouts(mission_id, indexes)` | anyone | Re-sends failed transfers |
| `withdraw_refund(mission_id)` | anyone | Sends what's owed (remainder or unspent prize) to the **sponsor only** |
| `refund_unsettled(mission_id)` | sponsor | Safety valve: takes the full prize back 14 days after the deadline if it was never finalized |
| `set_operator` | owner | Rotates the operator |
| `get_config`, `get_mission`, `get_winners` | views | Read state |

### Guarantees enforced on-chain

- Prize tokens leave only to a posted winner (exactly one equal share each) or back to that mission's sponsor.
- Winners can be posted only after the deadline, once per mission, without duplicates.
- Every winner gets the same amount; the rounding remainder goes back to the sponsor.
- Only the configured token, only the mission's sponsor, and only before the deadline can fund a mission.
- If the operator disappears, the sponsor recovers the prize after the grace period.

### Trust assumption

The operator (the NEAR District worker) decides **who** solved every secret. That can't be checked on-chain, because answers are sealed until the deadline. The operator can't change share sizes, pay anyone twice, pay early, or send funds anywhere else.

### Events

NEP-297 `EVENT_JSON` logs with standard `near_district_prize_vault`: `mission_created`, `prize_funded`, `winners_finalized`, `reward_paid`, `reward_failed`, `mission_completed`, `mission_refunded`, `refund_sent`, `refund_failed`.

### Build and tests

- **Build:** `sh contracts/prize-vault/build.sh`, which uses `--cfg near` (NEAR host functions, readable panic messages) and MVP wasm features.
- **Tests:** 15 unit tests (`docker compose run --rm contract-tests`). They cover funding rules, deadlines, duplicates, equal shares and remainder, batched payouts, failed-transfer retries, refunds and the sponsor safety refund.

---

## 5. Economy and money flow

### Who pays what

| Party | Pays | Gets |
|---|---|---|
| **Project (sponsor)** | The fixed prize in USDC (locked in the vault), plus 0.01 NEAR storage per mission and normal gas | Engaged explorers learning about the project, on-chain activity at its contracts (as a partner), and any unspent prize back (remainder or no winners) |
| **Explorer** | Nothing to play. Optional on-chain hint activities cost gas, and any deposit stays the player's own (for example, wrapped NEAR is still theirs as wNEAR) | An equal share of the prize if they solve every secret |
| **Operator (NEAR District)** | Gas for settlement, 0.0015 NEAR storage per winner, and 0.00125 NEAR token registration for winners who aren't registered yet | Nothing from the prize: the contract has no fee |

### Prize maths

```
share     = floor(prize / qualified_winners)      e.g. 300.000000 USDC / 6 = 50.000000 each
remainder = prize − share × qualified_winners     → back to the sponsor
nobody qualified                                  → the full prize back to the sponsor
```

A player who solved 2 of 3 secrets gets nothing, so not everyone automatically wins. Speed, wallet size and number of transactions don't change the share.

### Money flow end to end

```
Project wallet ──create_mission──▶ Prize vault (escrow, per mission)
Project wallet ──ft_transfer_call (USDC)──▶ Prize vault          [prize locked; publish check verifies it]
          ... mission live, explorers play, answers sealed ...
Deadline ─▶ worker scores answers ─▶ finalize(winners) ─▶ payout ─▶ each winner's NEAR wallet
                                                       └▶ withdraw_refund ─▶ project wallet (remainder / no winners)
```

### Platform revenue

Currently **none**: the contract takes no cut, and the prize is 100 % for winners. Possible models for later, none implemented: a listing or featured-placement fee for projects, paid partner-hint placements, or a small hosting fee charged outside the prize.

### Demo data (testnet)

- **Prizes:** four demo missions with prizes locked on-chain, 750 testnet USDC in total: RHEA 300, NEAR 200, LiNEAR 100, NEAR Social 150. A warm-up mission (20 USDC) was settled and paid on-chain by the live worker.
- **Company wallets:** `rhea.` / `near.` / `linear.` / `social.neardistrict-host.testnet`.
- **Explorer wallet:** `neardistrict-player.testnet`.

---

## 6. Security and anti-abuse

| Area | Measure |
|---|---|
| Answers | Salted HMAC digests with a server pepper; rules and saved answers are AES-256-GCM encrypted; no correctness feedback before the deadline |
| Abuse | One entry per person; rate limits on API routes; held qualifications for review; reports and moderation. Sealed answers reduce trial-and-error, but don't stop automation, answer sharing or multiple wallets. |
| Web | Strict CSP with nonces and no `eval` (PixiJS uses its eval-free module); same-origin CSRF checks (Origin / Fetch-Metadata); zod validation on every route; http-only session cookies |
| Money | The chain is the source of truth; deposits are credited only from verified events; the ledger is built only from vault events; operator calls are idempotent; reconciliation alerts admins; the contract enforces payout destinations |
| Keys | The web app holds no keys. Only the worker holds the operator key, set as a platform secret. Users' keys never leave their wallets. |
| Audit | Admin actions and money steps are written to `auditLogs` |

---

## 7. Deployment

### Services on Railway

| Service | Start | Required variables |
|---|---|---|
| **web** (`near-district`, domain `neardistrict.quest`) | `next start --port $PORT` (`Dockerfile.web`) | `APP_URL=https://neardistrict.quest`, `DATABASE_URL`, `NEAR_NETWORK=testnet`, `NEAR_RPC_URLS`, `ANSWER_PEPPER`, `ANSWER_ENCRYPTION_KEY`, `IP_HASH_SALT`, `VAULT_CONTRACT_ID`, `NEXT_PUBLIC_TESTNET_USDC_CONTRACT`, `NEXT_PUBLIC_TESTNET_USDC_SYMBOL`, `NEXT_PUBLIC_TESTNET_RHEA_CONTRACT` |
| **worker** | `pnpm --filter @near-district/worker start` | `DATABASE_URL`, `NEAR_NETWORK`, `NEAR_RPC_URLS`, `VAULT_CONTRACT_ID`, `OPERATOR_ACCOUNT_ID`, `OPERATOR_PRIVATE_KEY` (testnet token defaults built in) |
| **Postgres** | managed | — |

`ANSWER_PEPPER` and `ANSWER_ENCRYPTION_KEY` must be the same values that were used when the missions were created. A mismatch makes answer checks fail.

### Setting up the demo on a hosted database

```bash
# .env.railway (git-ignored): DATABASE_URL=<hosted Postgres public URL>
pnpm --filter @near-district/web seed:demo -- --live     # add-only, refuses to run twice
```

It opens and funds each demo mission on-chain from the company wallets (keys in `~/.near-credentials`), publishes through the normal on-chain publish check, and adds a warm-up mission that the worker pays out.

### Local development

```bash
pnpm install && docker compose up -d postgres && pnpm db:migrate
pnpm dev            # web
pnpm dev:worker     # worker
pnpm --filter @near-district/web seed:demo               # local demo (wipes the local DB)
```

---

## 8. Testing

| Suite | Count | Covers |
|---|---|---|
| Contract (Rust) | 15 | Escrow rules, shares, payouts, refunds |
| `packages/core` | 32 | Money, answers, rewards, state machines |
| `packages/near` | 31 | NEP-413, activity verification decoders, vault events |
| `packages/db` | 5 | Schema rules, append-only triggers |
| `apps/web` | 44 | Campaign engine, hints, cooperation |
| `apps/worker` | 8 | Job queue, payout driver (equal shares, failed-transfer retry, no-winner refund, scoring race), idempotency |

**Live checks done on `neardistrict.quest`:**
- the map renders under the production CSP;
- logos load;
- join and lock-in work, and the answer was graded correctly;
- the worker settled and paid the warm-up mission on-chain.

---

## 9. Limitations and next steps

- **Testnet only.** The prize vault needs an independent audit before mainnet, and the operator should then use a separate multisig-owned setup.
- **Upload storage** is the web service's local disk; use a Railway volume or object storage for host uploads in production. Demo logos ship with the app.
- **Operator trust:** who qualified is decided off-chain, by design, because answers are sealed.
- **Single prize token** per vault deployment.
- **Still to do:**
  - wallet sign-in tested end to end on the live domain;
  - multi-sponsor expedition prizes;
  - a platform revenue model;
  - optional custom domain for `www` (needs a Railway plan upgrade).
