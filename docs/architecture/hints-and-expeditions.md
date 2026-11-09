# Hint Quests & Cooperative Expeditions

Explore → complete activities → unlock hints → solve the hunt → qualify under the hunt's published rules.

Activities never pay anything by themselves. They only unlock clues. Rewards still come exclusively from
the existing campaign reward engine (qualifications → eligibility snapshot → vault allocation).

## 1. Integration assessment (what already existed)

| Existing piece | How the new features use it |
|---|---|
| `treasure_questions` + `treasure_answer_rules` (encrypted, server-side checking) | Hints hang off questions. Answer checking is untouched. |
| `participant_entries.progress` (server-authoritative position) | The player's place is already persisted, so leaving for a partner Space and coming back resumes the same question. |
| `campaign_versions` (immutable rules + hash) / question lock after publish | Hints are locked at publish like questions; every hint carries its own `rules_hash`, and each unlock records the hash it was evaluated against. |
| `organizations` / `organization_members` roles + `requireOrgRole` | Partnerships, offerings, manual reviews and expedition approval all require `admin`+ in the acting organization. |
| `wallet_connections` (NEP-413 signed ownership proof) | The only accepted identity for on-chain evidence: the tx signer must be one of the user's verified accounts. |
| `NearRpc` (`finality: final`, `tx` with `wait_until: FINAL`) | Base of the on-chain verifier. |
| Postgres job queue (worker) | Retries verifications that are waiting on finality, holding periods or RPC recovery. |
| `audit_logs`, `rate_limits`, `moderation_reports` | Reused for every new mutation, for verify/answer throttles and for abuse reports. |
| `getWorldData()` routes (`WorldRoute`, already drawn by the map) | Expeditions supply real routes. Nothing is drawn unless an expedition is selected. |

## 2. Verifiers — what can genuinely work today

| Activity type | Status | Evidence |
|---|---|---|
| `internal_campaign_completion` | **Implemented** | `participant_entries.status = completed` (hunt) or a non-withdrawn `creative_submissions` row (contest). |
| `internal_quiz` | **Implemented** | A completed hunt used as a quiz, with an optional minimum score. |
| `internal_question_sequence` | **Implemented** | Hunt `progress ≥ N` (first N questions solved). |
| `internal_contest_entry` | **Implemented** | Submission exists and isn't withdrawn or rejected. |
| `manual_review` | **Implemented** | Player submits text/link → the *activity owner's* reviewers approve or reject; the decision is audited. |
| `near_rhea_swap` | **Implemented** | Final tx on mainnet, signed by the user's verified wallet; a **successful** receipt executed by `v2.ref-finance.near` logging `Swapped <in> <token_in> for <out> <token_out>`. Exact token contract ids, minimum input amount, time window. |
| `near_rhea_lending_supply` | **Implemented** | Final tx signed by the user's wallet; a successful receipt by `contract.main.burrow.near` emitting NEP-297 `{"standard":"burrow","event":"deposit"}` for that account and token; amount converted from Burrow internal units with the live `extra_decimals`; optional holding period re-checked against `get_account` after it elapses. |
| Liquidity provision, asset holding, NFT ownership, generic contract interaction | Not supported | No adapter yet; disabled in the builder. |
| Partner API (signed events) | Not supported | Needs a per-partner key-exchange and consent trust model; disabled. |
| "Swap using Meteor" | **Not supported** | A Meteor in-wallet swap routes through other DEXes and leaves no attribution we can verify. We offer the generic RHEA swap quest instead. |
| USD-denominated thresholds | Not supported | No defensible execution-time price source is integrated; token-denominated only. |

Facts verified against mainnet on 2026-11-09 (real outcomes saved as test fixtures in
`packages/near/src/fixtures/`):

- Contracts (RHEA guide → Developers → Contracts): exchange `v2.ref-finance.near`, lending
  `contract.main.burrow.near`, DCL `dclv2.ref-labs.near`.
- Swap log format: tx `Fdp7vhmYxNeG8hiif3XP9zGYuzxp3YTX9p9XWrhaKswf` → `Swapped 1200000 zec.omft.near for 4136983635846078001539158 wrap.near` (plain log, no NEP-297 event).
- Burrow deposit event: tx `8wXH3rW9i43VUMmiN9oH7bQ6wWNdD7oxC4iLs4hSoRP1` →
  `EVENT_JSON:{"standard":"burrow","event":"deposit","data":[{"account_id","amount","token_id"}]}` with `amount` in internal units
  (`token decimals + extra_decimals`).
- Token decimals / Burrow `extra_decimals`: USDC 6/12, USDt 6/12, wNEAR 24/0, ZEC 8/10.

A transaction hash from the browser is only a *pointer*. The server fetches the final outcome itself and
checks signer, success of the specific receipt, contract, token, amount, block time and reuse. A failed
receipt never counts.

## 3. Data model (migration 0005)

- `treasure_hints`: belongs to a question; public teaser, secret `content` (never returned before unlock),
  `unlock` rule tree (null = free), availability window, partner-withdrawal policy, `rules_hash`.
- `organization_partnerships`: invitation states PENDING / ACCEPTED / REJECTED / CANCELLED / EXPIRED.
- `activity_offerings`: an activity an organization owns and offers to its accepted partners (versioned by hash).
- `activity_verifications`: every attempt (`pending`, `under_review`, `verified`, `failed`) with reason code,
  input pointer and retry schedule.
- `activity_completions`: verified evidence per (user, hint, requirement); `exclusive_ref` is unique per
  campaign, so one transaction can't satisfy two requirements in the same hunt.
- `hint_unlocks`: (user, hint) with the rule hash and the completion ids used.
- `expeditions`, `expedition_partners`, `expedition_chapters`, `expedition_progress`.

## 4. Rule engine

`RuleNode = { op: "ANY" | "ALL", children: (RuleNode | ActivityLeaf)[] }`. Nesting is supported and tested.
Only ANY and ALL are exposed; COUNT and SEQUENCE are reserved. Evaluation is pure (`@yielvy/core`) and always
server-side. An unlock is written in the same transaction as the completion that satisfied the rule.

## 5. Cooperation

- **Partner hints:** Org A can attach only offerings from organizations with an ACCEPTED partnership. The leaf
  stores the offering id and owner org and a snapshot of the activity. If the partner withdraws after launch,
  the hint follows its published policy: `disable` (the requirement stays and the hint is marked unavailable for
  new unlocks) or `free` (the hint opens for everyone). Requirements are never changed silently.
- **Shared expeditions:** the primary organizer creates the expedition and invites partners; each partner
  approves participation by contributing one of its *own* published campaigns as a chapter. Chapters reference
  existing campaigns, which keep working on their own. Progress is computed from real campaign completions.
  Chapter N opens when chapters 1…N-1 are complete.
- **Rewards:** V1 supports a single organizer-funded expedition. The primary organizer can designate one of
  its own campaigns as the *reward chapter*. Joining that campaign requires a completed expedition. Its prize
  is funded and paid by the existing vault and reward engine. Multi-sponsor reserves are deferred until the
  vault accounting is reviewed for shared principal.

## 6. Operations

- **Worker:** `hints.reconcile` runs every 60 s and re-checks pending on-chain verifications (not final yet,
  holding period, RPC outage) with the same engine the web app uses. It gives up after 60 attempts and marks
  the verification failed with a reason; nothing stays pending forever.
- **Mainnet only for RHEA:** wallet ownership is proven per network, so on-chain activities are selectable only
  when `NEAR_NETWORK=mainnet`. On testnet they're shown as unavailable in the builder.
- **Player APIs:** `POST /api/campaigns/:id/hints/:hintId/verify` and `…/reveal`. They require a joined, in-progress
  entry that has reached the hint's question, and are rate-limited per user and per requirement.
- **Organizer APIs:** `/api/organizer/campaigns/:id/hints`, `…/hint-options`, `/api/organizer/partners`,
  `/api/organizer/offerings`, `/api/organizer/reviews`, `/api/organizer/expeditions`.
- **Abuse controls in place:** server-side answers and evidence, per-question attempt limits, verified wallet
  ownership, `final` finality, unique evidence per campaign, requirement time windows, rate limits, audited reviews,
  abuse reporting (existing), and fast-completion holds (existing qualification logic).

## 7. Fairness and compliance

Every paid or financial activity hint should sit next to a free alternative. The builder warns when a hint
has only on-chain paths. Trading volume is not proof of a unique human, and the UI never says it is.
