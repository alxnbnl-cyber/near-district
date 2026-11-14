<p align="center">
  <img src="apps/web/public/assets/brand/near-district-mark.webp" alt="NEAR District" width="96" height="96" />
</p>

<h1 align="center">NEAR District</h1>

<p align="center"><strong>Explore. Play. Earn.</strong></p>

<p align="center">
  NEAR District turns ecosystem discovery into connected, playable missions. NEAR projects host mysteries on an interactive map, link their missions together through verified on-chain hints, and fund fixed prize pools that are paid out in equal shares by a smart contract.
</p>

<p align="center">
  <a href="https://neardistrict.quest/"><strong>Explore NEAR District</strong></a> ·
  <a href="https://x.com/alx197600/status/2121696430717022643"><strong>Watch Demo</strong></a> ·
  <a href="https://github.com/alxnbnl-cyber/near-district"><strong>GitHub Repository</strong></a>
</p>

<p align="center">
  <img src="docs/assets/near-district-home.jpg" alt="NEAR District home screen with the interactive district map" width="900" />
</p>

---

## The problem

The NEAR ecosystem is full of applications and communities, but discovering them is still mostly a series of separate journeys.

| | |
|---|---|
| **Fragmented discovery** | Every application has its own site and audience. There is no connected, enjoyable way to move from one project to the next. |
| **Limited exposure for new projects** | Newly launched applications need a way to introduce themselves to people who will actually try them. |
| **Disconnected campaigns** | Promotional quests usually focus on a single project, so participants rarely meet the rest of the ecosystem along the way. |
| **Low-quality participation** | Reward campaigns often encourage repetitive task completion instead of genuine discovery or real use of a product. |
| **Checklist quests** | Task lists work, but they offer little exploration, story or game feel. |
| **Reward transparency** | Participants and sponsors both benefit from a clear, verifiable record of how a prize is funded and distributed. |

## Our solution

**A connected, playable gateway to the NEAR ecosystem.**

| | |
|---|---|
| **Interactive ecosystem discovery** | Projects appear as destinations on a living district map. Explorers browse, zoom and open missions where the projects live. |
| **Gamified mystery missions** | Each mission is a story with secrets to decrypt, not a task list. |
| **Verified on-chain hint unlocking** | An optional hint unlocks when the player makes a qualifying NEAR contract call, checked by the backend against the chain. |
| **Cross-project collaboration** | A project can use another project's on-chain activity as a hint, so solving one mystery leads players to a second application. |
| **Sealed-answer gameplay** | Answers stay sealed until the deadline, which keeps the focus on solving rather than guessing. |
| **Transparent fixed-prize distribution** | Prizes are locked in a NEAR smart contract and paid automatically, in equal shares, to everyone who solves every secret. |

NEAR District does not simply display a list of sponsored tasks. It connects multiple NEAR projects through interactive missions, where exploring one application leads you to the next.

<p align="center">
  <img src="docs/assets/near-district-map.jpg" alt="Explorer map showing a live mission and its prize pool" width="900" />
</p>

## What makes NEAR District different

### 1. Cross-project discovery

A project can publish an **activity offering**: a specific on-chain action at its own contract, such as wrapping NEAR into wNEAR. Partner projects can attach that offering to a hint inside their own mystery.

When a player reaches that secret, the map moves them across the district to the partner's destination, and the mission shows the partner's quest with a direct link to its app. The player completes the activity there, the hint unlocks, and they return to the original mystery.

> **Example.** A player starts a mystery hosted by Project A. Secret 2 has an optional hint linked to Project B. The player follows the connection across the map, makes a qualifying contract call at Project B, and NEAR District verifies the transaction through its indexer and RPC checks. The hint unlocks and helps them continue Project A's mystery. At the deadline, solving every secret qualifies them for an equal share of the prize.

- **Project A** delivers a richer, more engaging campaign.
- **Project B** gains discovery and real, relevant on-chain activity.
- **Players** experience several NEAR applications through one connected adventure.

Partnerships are explicit: a project can only use offerings from partners who have accepted its invitation, and if a partner withdraws an offering, the hint follows the policy the host published with the mission.

### 2. On-chain activities unlock hints, not rewards

NEAR District verifies that the player's own wallet made a qualifying smart contract function call: the right contract, the right method, a successful and final transaction. A successful verification unlocks an optional clue. It never pays the player or changes their share of the prize.

More trading, higher volume and repeated contract calls do not increase a player's reward. On-chain interaction becomes part of solving the mystery rather than a way to farm points. The general-purpose verifier confirms a qualifying function call; it does not claim to verify the full business outcome of a swap or bridge.

### 3. Solve together, share equally

Players lock in answers without seeing whether they are right. Answers stay sealed until the deadline, and players can change them until then. When the mission ends, every eligible player who solved **all** secrets receives the same share of the fixed prize.

There are no speed bonuses, no trading-volume multipliers and no random draws in the mission reward model. Withholding correctness feedback removes the simplest trial-and-error strategy. Together with rate limits, per-question attempt limits and review holds for implausibly fast completions, it keeps the game about solving.

## How it works

**For projects**

1. Create a project profile and destination on the map.
2. Get approved.
3. Create a mission and configure its secrets.
4. Add optional verified hints, including partner activities.
5. Fund the fixed prize pool on NEAR.
6. Publish the mission.

**For explorers**

1. Connect a NEAR wallet.
2. Explore the map.
3. Discover a mission.
4. Decrypt its secrets.
5. Optionally unlock hints through verified on-chain activities.
6. Lock in your answers before the deadline.
7. Receive an equal share if you solved every secret.

## Core features

| Feature | What it does |
|---|---|
| **Interactive district map** | A PixiJS-rendered district with project destinations, mission pins, prize badges, minimap and zoom |
| **NEAR wallet authentication** | Sign in with MyNearWallet or Meteor through a NEP-413 signed message, with the key checked on-chain |
| **Company profiles** | Each project gets a destination, logo, description and approval status |
| **Mission builder** | Story, secrets, hints, prize and timeline, with a launch checklist |
| **Decrypt secrets** | The in-mission view for reading clues and locking in answers |
| **Sealed answers** | Answers are encrypted, can be changed until the deadline, and are scored only after it |
| **Verified on-chain activity** | Server-side checks of NEAR transactions: contract, method, signer, success, finality |
| **Partner hint offerings** | Projects publish activities that accepted partners can use in their own missions |
| **Cross-project navigation** | The map guides players from one project's mission to a partner's destination and back |
| **Fixed prize vault** | A Rust smart contract that holds each mission's prize in escrow |
| **Deadline-based scoring** | Sealed answers are scored when the mission ends; only complete solutions qualify |
| **Automatic equal-share payouts** | The worker settles each mission and the contract pays every winner directly |
| **Explorer progress** | Explorer rank, joined missions, and paid rewards with transaction links |
| **Organizer console** | Profile, missions, partners, offerings, reviews, participants and prize funding |

NEAR District also supports **Creative Challenges**: projects ask for ideas, feedback or creative work, and their team selects the winners. The prize is held by the same vault and split equally among the selected winners. Unlike Missions, winner selection is manual.

## Reward economy

```mermaid
flowchart LR
    A[Project wallet] -- "fixed prize (USDC)" --> B[Prize vault contract]
    B -- "locked until the deadline" --> C[Deadline scoring]
    C -- "everyone who solved every secret" --> D[Equal shares]
    D --> E[Winners' NEAR wallets]
    B -. "rounding remainder or no winners" .-> A
```

- **Fixed prizes:** the project sets the amount up front, denominated in USDC.
- **Held on-chain:** the prize is deposited into the NEAR prize-vault contract, and the app verifies the deposit on-chain before the mission can go live.
- **Locked during the mission:** funds can only leave the vault after the deadline, to winners or back to the sponsor.
- **Equal shares:** `share = prize ÷ qualified players`, fixed by the contract when results are finalized.
- **Automatic payout:** each share is transferred straight to the winner's NEAR wallet, with no claim step.
- **Sponsor refunds:** the rounding remainder, or the whole prize if nobody qualifies, goes back to the project.

| Prize pool | Qualified explorers | Each receives |
|---|---|---|
| $300 | 6 | $50 |

This example illustrates the allocation rule. The current deployment runs on **NEAR Testnet with testnet USDC**, a demonstration token with no monetary value. See [Economics](docs/ECONOMICS.md) for the full model.

## Business model and sustainability

NEAR District serves NEAR projects that want exposure, engagement and discovery. Its core value is helping a project introduce people to its product through connected, playable missions, and giving partner projects a natural way to reach each other's audiences.

**Today**

- Projects supply the campaign prize.
- NEAR District takes **no platform fee**; the full prize goes to winners under the mission's published rules.
- The operator covers settlement gas and token-registration costs for winners.

**Future revenue opportunities** (planned, not yet implemented)

| Model | Description |
|---|---|
| **Campaign hosting fees** | A fixed service fee for publishing and managing funded campaigns, charged separately from the prize |
| **Featured discovery placements** | Optional, clearly labelled placements for projects seeking more visibility on the map |
| **Premium organizer tools** | Deeper engagement analytics, campaign insights and management features |
| **Enterprise and ecosystem campaigns** | Custom multi-project discovery experiences for foundations, communities and ecosystem initiatives |

Projects pay for a campaign because they want exposure and measurable engagement. New missions, partner activities and connected journeys create recurring reasons for explorers to return and for projects to run campaigns. Future revenue would fund infrastructure, verification services, campaign operations and development. See [Economics](docs/ECONOMICS.md).

## How NEAR is used

NEAR provides the identity, the activity evidence and the settlement layer of the product.

| Capability | How NEAR District uses it |
|---|---|
| **NEP-413 signed messages** | Wallet sign-in: the player signs a single-use challenge with their NEAR key |
| **Account ownership checks** | The server confirms via RPC that the signing key is a full-access key of the account |
| **Contract function-call detection** | Hint verification looks for a call from the player's account to the configured contract and method |
| **Final execution evidence** | The verifier reads the final transaction outcome from NEAR RPC (archival where needed) |
| **NearBlocks indexing** | Candidate transactions for a player's account are discovered through the NearBlocks API |
| **NEP-141 token transfers** | Prizes are deposited with `ft_transfer_call` and paid out with `ft_transfer` |
| **Rust smart contract** | `contracts/prize-vault` (near-sdk 5) holds each mission's prize in escrow |
| **NEP-297 events** | The vault logs `prize_funded`, `reward_paid` and similar events, which the app uses for its ledger and confirmations |
| **Direct account settlement** | Winners are paid to the same NEAR account they signed in with |

Because activity evidence, prize custody and payouts all live on NEAR, a project's funding and every payout can be checked independently on a block explorer.

## Technical architecture

```mermaid
flowchart LR
    U[Browser<br/>Next.js + PixiJS] -->|HTTPS| W[apps/web<br/>Next.js 16 API]
    W --> DB[(PostgreSQL<br/>Drizzle ORM)]
    WK[apps/worker<br/>Node.js jobs] --> DB
    W -->|verify| RPC[NEAR RPC]
    W -->|candidates| NB[NearBlocks]
    WK -->|finalize · payout| V[prize-vault<br/>Rust contract]
    V -->|NEP-141| T[USDC token]
```

| Layer | Technology |
|---|---|
| Web app | Next.js 16, React, TypeScript, PixiJS |
| Data | PostgreSQL with Drizzle ORM |
| Background worker | Node.js with a durable Postgres job queue |
| Chain access | NEAR RPC, NearBlocks indexer, NEP-413 |
| Contract | Rust, near-sdk 5 (`contracts/prize-vault`) |
| Prize token | NEP-141 stablecoin (testnet USDC) |
| Hosting | Railway (web, worker, Postgres) |

Detailed design: [Architecture overview](docs/architecture/overview.md) · [System reference](docs/NEAR-DISTRICT-SYSTEM.md).

## Working NEAR Testnet implementation

| Evidence | Detail |
|---|---|
| Live application | [neardistrict.quest](https://neardistrict.quest/) |
| Prize vault | [`neardistrict-vault.testnet`](https://testnet.nearblocks.io/address/neardistrict-vault.testnet) |
| Prize token | [`usdc.fakes.testnet`](https://testnet.nearblocks.io/address/usdc.fakes.testnet) (testnet USDC) |
| Funded demo missions | 4 live missions holding **750 testnet USDC** in the vault (300 · 200 · 100 · 150) |
| Completed payout | Warm-up mission settled automatically; **20 testnet USDC** paid to the winner in tx [`FYjZA8bn…aq53`](https://testnet.nearblocks.io/txns/FYjZA8bnawFjxuruGiSeN4FkVzrK6LSXrPtxzMS3aq53) |
| Mission types | 2 live: Missions and Creative Challenges |
| Activity verification types | 10 supported, including generic NEAR contract calls, RHEA swap and lending, staking and in-app progress |
| Automated tests | **135 passing**: 15 contract tests and 120 TypeScript tests across core, NEAR, database, web and worker |

All amounts above are testnet demonstration funds. Demo projects use well-known NEAR names as examples and do not represent official partnerships. Step-by-step reviewer guide: [Demo](docs/DEMO.md).

## Quick start

**Requirements:** Node.js 22+, pnpm 10, Docker (for PostgreSQL), and a Rust toolchain if you want to build the contract.

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment (fill in the secrets; comments explain each value)
cp .env.example .env.local
cp .env.example apps/web/.env.local

# 3. Start PostgreSQL and run migrations
POSTGRES_PASSWORD=change-me docker compose up -d postgres
DATABASE_URL=postgres://neardistrict:change-me@127.0.0.1:54329/neardistrict pnpm db:migrate

# 4. Run the web app (http://localhost:3000) and the worker
pnpm dev
pnpm dev:worker

# 5. Optional: seed the local demo (wipes the local database)
pnpm --filter @near-district/web seed:demo
```

Sign in with a NEAR testnet wallet (MyNearWallet or Meteor). To grant yourself admin after your first sign-in:

```bash
DATABASE_URL=... pnpm --filter @near-district/db grant-admin -- --near yourname.testnet --role superadmin
```

**Tests and contract**

```bash
pnpm test                                   # core, NEAR, database, web and worker suites
docker compose run --rm contract-tests      # prize vault contract tests (or: pnpm test:contract)
pnpm build:contract                         # builds the prize vault wasm for the NEAR runtime
```

Deploying your own vault and running the full on-chain flow: [Testnet deployment](docs/operations/testnet-deploy.md).

## Documentation

| Document | Contents |
|---|---|
| [Product](docs/PRODUCT.md) | Vision, users, gameplay, connected discovery, differentiation |
| [Economics](docs/ECONOMICS.md) | Reward model, fees, revenue opportunities, success metrics |
| [Demo](docs/DEMO.md) | Reviewer walkthrough, on-chain evidence, how to reproduce |
| [Architecture overview](docs/architecture/overview.md) | Components, data flow, key decisions |
| [System reference](docs/NEAR-DISTRICT-SYSTEM.md) | Full technical reference of every subsystem |
| [Prize vault](docs/architecture/prize-vault.md) | Contract methods, guarantees, trust model, events |
| [Hints and cooperation](docs/architecture/hints-and-expeditions.md) | Verifiers, rule engine, partner offerings, expeditions |
| [Threat model](docs/security/threat-model.md) · [Keys](docs/security/key-management.md) | Security controls and key roles |
| [Testnet deployment](docs/operations/testnet-deploy.md) · [Deployment](docs/deployment/deploy.md) | Running and hosting NEAR District |
| [Status](docs/status.md) · [Roadmap](docs/roadmap.md) | What is done and what comes next |

## Links

- **Website:** https://neardistrict.quest/
- **Demo video:** https://x.com/alx197600/status/2121696430717022643
- **Repository:** https://github.com/alxnbnl-cyber/near-district

<p align="center"><strong>NEAR District — Explore. Play. Earn.</strong></p>
