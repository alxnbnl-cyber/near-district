# NEAR District: reward economy and business model

NEAR District is an ecosystem discovery and engagement product. Projects fund prizes to bring people to their applications; explorers solve missions to win them. The reward source is always the project's own funded prize.

## Customer segments

| Segment | Need |
|---|---|
| **NEAR projects** (new and established) | Exposure, engaged users, meaningful on-chain activity at their contracts |
| **Partner projects** | Discovery through other projects' audiences |
| **Ecosystem teams and communities** | Multi-project experiences that connect the ecosystem |
| **Explorers** | A fun, fair way to discover NEAR and win prizes |

## Value proposition for NEAR projects

- **Discovery:** a destination on a shared map where explorers look for things to do.
- **Engagement:** players spend time with the project's story and product to solve its secrets.
- **Real activity:** hint activities are actual contract calls at the project's own contracts.
- **Cross-project reach:** partner hints send other projects' players to you, and yours to them.
- **Trust:** the prize is visibly locked in a smart contract before the mission launches.
- **Quality of engagement:** because activities unlock clues rather than rewards, a sponsor's prize goes to players who solved the mystery, not to those who repeated the most transactions.
- **No payout operations:** settlement and payouts are automatic.

## How the reward model works

### Fixed-prize funding

The project sets a fixed prize, denominated in USDC (testnet USDC on the current deployment). The amount does not change during the mission.

### Prize escrow

1. The project's wallet opens a mission escrow in the prize vault (`create_mission`, with the mission deadline).
2. It deposits the prize with a NEP-141 `ft_transfer_call` to the vault.
3. The app reads both transactions from the chain and confirms the vault's events (`mission_created`, `prize_funded`).
4. The mission can only be published once the vault holds at least the planned prize, with the same deadline.

During the mission the prize is locked. The contract only allows it to leave after the deadline, to winners or back to the sponsor.

### Winner eligibility

- **Missions:** every player who correctly solved **all** secrets before the deadline, with a verified payout wallet.
- **Creative Challenges:** the winners selected by the project's team.

Speed, wallet size and number of transactions do not affect eligibility or share size, and the mission reward has no random draw. Hint activities unlock clues only; they grant no points, entries or extra allocation. How the gameplay discourages reward farming: [README](../README.md#3-designed-for-meaningful-participation).

### Equal-share distribution

```
share     = floor(prize / qualified_winners)
remainder = prize − share × qualified_winners      → returned to the sponsor
```

| Prize pool | Qualified explorers | Each receives | Returned to sponsor |
|---|---|---|---|
| $300 | 6 | $50 | $0 |
| $100 | 3 | $33.333333 | $0.000001 |

These examples illustrate the rule. The contract fixes the share when results are finalized, so every winner receives the same amount.

### Automatic payout

After the deadline the worker:
1. scores the sealed answers and freezes the winners;
2. posts them to the vault (`finalize`);
3. pushes payouts in batches of 10 (`payout`), retrying any failed transfer.

Each share is a direct token transfer to the winner's NEAR wallet, and the app records the transaction hash for every reward.

### Sponsor refunds

- The **rounding remainder** is returned to the sponsor (`withdraw_refund`).
- If **nobody qualifies**, the whole prize is returned.
- If a mission were never settled, the sponsor can reclaim the full prize **14 days after the deadline** (`refund_unsettled`).

## Current fee structure

| Item | Who pays | Amount |
|---|---|---|
| Prize | Project | Set by the project; 100% goes to winners (minus any rounding remainder, which returns to the project) |
| Mission escrow storage | Project | 0.01 NEAR per mission |
| Deposit and setup gas | Project | Standard NEAR gas |
| Settlement gas | NEAR District operator | Standard NEAR gas |
| Winner storage in the vault | NEAR District operator | 0.0015 NEAR per winner |
| Token registration for new winners | NEAR District operator | 0.00125 NEAR per unregistered winner |
| **Platform fee** | — | **None.** The contract has no fee logic. |

Joining a mission is free. Optional hint activities cost only normal gas, plus whatever deposit the activity itself involves; for example, wrapped NEAR stays in the player's wallet as wNEAR.

## Future revenue opportunities

These are planned commercial options, not current features.

| Model | How it would work |
|---|---|
| **Campaign hosting fees** | A fixed service fee for publishing and managing a funded campaign, charged separately from the prize so the prize remains 100% for winners |
| **Featured discovery placements** | Optional, clearly labelled placements for projects seeking more map visibility |
| **Premium organizer tools** | Engagement analytics, player-journey insights across partner missions, campaign management features |
| **Enterprise and ecosystem campaigns** | Custom multi-project discovery experiences for foundations, communities and ecosystem initiatives |

## Operating costs

- Hosting for the web app, worker and PostgreSQL.
- NEAR RPC and indexer access (a paid RPC provider is recommended at scale; NearBlocks API for transaction discovery).
- Settlement gas and per-winner storage and registration deposits.
- Moderation and review (company approval, held qualifications, reports).
- A smart-contract audit before any mainnet deployment.

## Commercial sustainability

A project pays for a campaign because it wants exposure and measurable engagement. NEAR District creates recurring reasons to come back: new missions, new partner connections and new paths across the district. Hosting fees and organizer tools can scale with the number of campaigns and the depth of insight projects need, and would support infrastructure, verification services, campaign operations and development.

## Success metrics

These are the metrics NEAR District is designed to measure.

| Metric | Why it matters |
|---|---|
| Participating projects | Breadth of the district |
| Funded missions | Projects committing real prizes |
| Unique participating NEAR accounts | Reach |
| Completed missions | Depth of engagement |
| Verified on-chain activities | Real product interaction |
| Cross-project referral interactions (partner-hint completions) | The connected-discovery effect |
| Returning explorers | Retention |
| Reward allocation and payout volume | Value delivered to players |
| Qualified engagement cost per mission (prize ÷ qualified players) | Efficiency for sponsors |

The current deployment is a working NEAR Testnet implementation; its demonstration figures are listed in [DEMO.md](DEMO.md).
