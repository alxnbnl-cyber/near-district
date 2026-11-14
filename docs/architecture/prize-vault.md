# Prize vault (`contracts/prize-vault`)

A small escrow contract on NEAR that holds every mission's fixed prize and pays it out in equal shares after the deadline.
There is no lending, yield or fee logic: the prize a project deposits is exactly what winners share.

Reward rules and fees: [ECONOMICS.md](../ECONOMICS.md) · Live evidence: [DEMO.md](../DEMO.md)

**Testnet deployment:** `neardistrict-vault.testnet`, operator `neardistrict-ops.testnet`, prize token `usdc.fakes.testnet` (testnet USDC, 6 decimals).

## Lifecycle

```
create_mission(deadline)          sponsor, attaches 0.01 NEAR storage           -> Open
ft_transfer_call(token -> vault)  sponsor, msg {"mission_id": "<id>"}           prize += amount (only before the deadline)
finalize(mission, winners)        operator, after the deadline                  -> Paying  (share = floor(prize / winners))
                                                                                 -> Refunded if there are no winners
payout(mission)                   anyone, up to 10 transfers per call            each winner receives exactly one share
retry_payouts(mission, indexes)   anyone, re-sends transfers that failed
withdraw_refund(mission)          anyone, sends what is owed to the sponsor     rounding remainder, or the whole prize
refund_unsettled(mission)         sponsor, 14 days after the deadline if never finalized
set_operator(account)             owner, rotates the operator key
```

Views: `get_config`, `get_mission(mission_id)`, `get_winners(mission_id, from_index, limit)`.

When every share has landed the mission is `Completed`.

## What the contract guarantees

- Prize tokens leave the vault only to a posted winner (one equal share each) or back to that mission's sponsor.
- Winners can be posted only after the on-chain deadline, once per mission, with no duplicates.
- Every winner receives the same amount. A rounding remainder goes back to the sponsor.
- Only the configured token is accepted, only the mission's sponsor can fund it, and only before the deadline. Anything else panics, so the token contract returns the deposit.
- If the operator never settles, the sponsor can take the full prize back 14 days after the deadline.

## What it trusts the operator for

Deciding who solved every secret. Answers are sealed and checked off-chain until the deadline, so correctness can't be verified on-chain.
The operator (the NEAR District worker) posts the list of players who qualified. It can't change the share size, pay anyone twice, pay before the deadline, or send funds anywhere else.

## Events

NEP-297 `EVENT_JSON` logs with standard `near_district_prize_vault`:
`mission_created`, `prize_funded`, `winners_finalized`, `reward_paid`, `reward_failed`, `mission_completed`, `mission_refunded`, `refund_sent`, `refund_failed`.
The web app credits a deposit only when a verified transaction contains a matching `prize_funded` event. The ledger is built only from these events (`packages/near/src/vault.ts`).

## How the app uses it

- **Projects** open the escrow and deposit the prize from their own NEAR wallet (Host dashboard → Funding). The publish check reads the mission from the chain: the prize must be deposited, at least the planned amount, with the same deadline as the mission.
- **The worker** (`apps/worker/src/rewards.ts`), after the deadline:
  1. freezes the winners;
  2. registers any winner with the token if needed;
  3. calls `finalize`;
  4. pushes `payout` batches and retries failed transfers;
  5. refunds the remainder;
  6. marks each reward paid with its payout transaction hash.
- **Players** don't claim anything. Their share arrives in their NEAR wallet, and My Rewards links to the transaction.

## Build, test, deploy

```bash
docker compose run --rm contract-tests     # 15 unit tests (Linux container)
sh contracts/prize-vault/build.sh           # wasm for the NEAR runtime (--cfg near, MVP wasm features)
near contract deploy <vault>.testnet use-file contracts/prize-vault/target-wasm/wasm32-unknown-unknown/release/near_district_prize_vault.wasm \
  with-init-call new json-args '{"owner_id":"<vault>.testnet","operator_id":"<ops>.testnet","token_id":"usdc.fakes.testnet"}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send
```

The vault account must be registered with the token (`storage_deposit`) before it can receive deposits.
The operator needs a full-access key, because `finalize` and token registrations attach small NEAR deposits.

## Not yet done

- No external audit. Treat the contract as testnet-only until it has one.
- Single token per deployment, and no upgrade mechanism (redeploying code keeps state if the layout is unchanged).
