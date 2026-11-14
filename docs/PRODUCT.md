# NEAR District: product overview

**Explore. Play. Earn.**

## Vision

NEAR District is a connected, playable gateway to the NEAR ecosystem. Instead of finding projects one website at a time, people explore a living district where every destination is a NEAR project, every mission is a mystery to solve, and missions link to one another so that discovering one application naturally leads to the next.

## The problems we address

1. **Fragmented discovery.** NEAR applications each have their own site, community and audience. Moving between them is a manual, disconnected process.
2. **Limited exposure for emerging projects.** New applications need a way to meet users who will actually try the product, not just see an announcement.
3. **Disconnected campaigns.** Most promotional quests are about one project. Participants rarely encounter the wider ecosystem.
4. **Low-quality reward participation.** Task-based rewards often attract repetitive clicking rather than real engagement.
5. **Checklist experiences.** Quest lists are functional but offer little story, exploration or play.
6. **Reward transparency.** Sponsors and players both want to see exactly how a prize is funded and paid.

## Who it is for

| User | What they want | What NEAR District gives them |
|---|---|---|
| **Explorers** | Interesting ways to discover NEAR, and a fair chance to win | A map to explore, mysteries to solve, and equal-share prizes paid to their wallet |
| **NEAR projects** | Exposure, engaged users, real on-chain activity | A destination on the map, a mission builder, partner hints, and a verifiable prize vault |
| **Partner projects** | Discovery through other projects' audiences | Activity offerings that other projects can use as hints in their missions |
| **Ecosystem teams** | Ways to connect the ecosystem | Multi-project journeys built from existing missions (expeditions) |

## The core solution

NEAR District combines three ideas:

1. **Connected ecosystem discovery:** missions link projects together through partner hints.
2. **Verified on-chain hints:** real NEAR activity unlocks clues, checked independently by the backend.
3. **Fair, fixed-prize rewards:** prizes are locked in a smart contract and split equally among everyone who solves every secret.

## The exploration experience

The district is an interactive map rendered with PixiJS. Each project has a destination; each live mission is a pin with its prize shown. Explorers drag and zoom across the city, hover a pin to see its reward, and open a mission to read its briefing, prize pool, timeline, rules and the company behind it. A progress panel tracks their rank, the missions they have joined, and the prizes they have been paid.

## Decrypt Secrets gameplay

A mission is a story with a set of secrets.

1. **Join.** One entry per person, free to play.
2. **Investigate.** Each secret is a question. The answer might be about the project, its product or the wider ecosystem.
3. **Lock it in.** The player submits an answer. It is sealed: they see that it was saved, not whether it is right. They can change it any time before the deadline.
4. **Get help.** Optional hints unlock through verified activities, often at a partner project.
5. **Deadline.** Answers are scored. Everyone who solved every secret qualifies, and the prize is paid automatically in equal shares.

Sealed answers keep the game about solving: there is no instant feedback to guess against.

## Connected project discovery

This is the heart of NEAR District.

A project can publish an **activity offering**: a specific action at its own contract, for example "wrap NEAR into wNEAR" (`wrap.testnet::near_deposit`). Projects that have an accepted partnership can attach that offering to a hint in their own mission.

**How it plays out:**

1. A player begins a mystery hosted by Project A.
2. Secret 2 has an optional hint linked to Project B.
3. When the player opens that secret, the map moves across the district to Project B's destination.
4. The mission shows Project B's quest card with a direct link to its app.
5. The player makes the qualifying contract call at Project B and taps "I did it".
6. NEAR District checks the transaction through the NearBlocks indexer and NEAR RPC: right account, right contract, right method, successful and final.
7. The hint unlocks and the player continues Project A's mystery.
8. At the deadline, solving every secret qualifies them for an equal share of Project A's prize.

**Why it matters:**

- **Project A** offers a richer mission that spans the ecosystem.
- **Project B** is discovered by an engaged audience and receives real activity at its contract.
- **Players** experience several NEAR applications in one adventure.

Partnerships are explicit and revocable. A project can only use offerings from partners who accepted its invitation. If a partner withdraws an offering, the hint follows the policy the host published: it either becomes unavailable for new unlocks or opens for everyone. Requirements never change silently.

## Benefits for projects

- A permanent destination on the district map, with a company profile.
- A guided mission builder: story, secrets, hints, prize and timeline.
- Partner hints that bring users from other projects, and offerings that send users to yours.
- A prize held in a smart contract and verified on-chain before launch, which builds trust with players.
- Automatic settlement: no manual payouts, and unused prize returns to the project.
- An organizer console for participants, reviews, partners and funding.

## Benefits for explorers

- A playful way to discover NEAR projects, guided by story and a map.
- Missions that are free to join.
- Optional hints that teach real on-chain actions.
- Equal shares for everyone who solves every secret: no race, no wallet-size or trading-volume advantage.
- Prizes paid directly to their NEAR wallet, with a transaction link for every payout.

## What makes it different

| Typical quest platform | NEAR District |
|---|---|
| A checklist of tasks per project | A mystery with a story, on a map of the ecosystem |
| Each campaign stands alone | Missions link projects through partner hints |
| Activity earns points or entries | Activity unlocks clues; it never changes the reward |
| Fastest or most active wins | Everyone who solves every secret shares equally |
| Rewards handled off-platform | Prize locked in and paid by a NEAR smart contract |

Company-sponsored missions and cross-project quests exist elsewhere; NEAR District's model is the combination: connected discovery as the core, mysteries instead of checklists, activities that reveal clues rather than rewards, sealed answers, and equal shares.

### Designed for meaningful participation

The mission mechanics are built so that the way to win is to solve the mystery:

- **Sealed answers** remove instant right-or-wrong feedback, so guesses can't be tested one by one.
- **Activities unlock hints, not rewards**, so repeating transactions earns nothing extra.
- **Equal shares** for everyone who solves every secret: speed, wallet size and transaction volume make no difference, and there is no random draw.
- **Server-side controls** back this up: rate limits, one entry per person, verified wallet ownership, one-use transaction evidence, and admin review of qualifications.

This reduces simple trial-and-error abuse and discourages reward farming; it does not make bots, multiple wallets or answer sharing impossible. Details: [README](../README.md#3-designed-for-meaningful-participation).

### Why NEAR

The design relies on NEAR specifically. One NEAR account works across every NEAR application, so the wallet a player signs in with (NEP-413) is the one that calls a partner's contract and the one that receives the prize. Contract-function calls are public evidence that NearBlocks and NEAR RPC can verify without any partner integration, and the prize is held and paid in NEP-141 tokens by a NEAR escrow contract. Details: [README](../README.md#why-near).

## Mission types

| Type | Status | How winners are decided |
|---|---|---|
| **Mission** (Decrypt Secrets) | Live | Everyone who solves every secret by the deadline; equal shares |
| **Creative Challenge** | Live | The project's team selects winners from submissions; the prize is split equally among them |
| Product Explorer | Planned | — |

**Expeditions** connect several missions from different projects into chapters, where chapter N opens once the earlier chapters are complete. A host can mark one of its own missions as the reward chapter.

## Long-term vision

NEAR District aims to become the place where people meet the NEAR ecosystem by playing in it: a district that grows as projects join, where each new mission adds a destination and a path to other destinations. Over time, ecosystem teams can run multi-project journeys, projects can measure how players move between applications, and explorers build a history of the projects they have discovered.
