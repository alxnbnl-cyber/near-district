# NEAR District: demo and technical evidence

A guide for reviewers who want to try the product and check its on-chain behaviour.

| | |
|---|---|
| Website | https://neardistrict.quest/ |
| Demo video | https://x.com/alx197600/status/2121696430717022643 |
| Repository | https://github.com/alxnbnl-cyber/near-district |
| Network | NEAR Testnet |
| Prize vault | `neardistrict-vault.testnet` |
| Prize token | `usdc.fakes.testnet` (testnet USDC, 6 decimals) |
| Verified payout | `FYjZA8bnawFjxuruGiSeN4FkVzrK6LSXrPtxzMS3aq53` |

All amounts are testnet demonstration funds with no monetary value. The demo projects use well-known NEAR names (RHEA, NEAR, LiNEAR, NEAR Social) as examples; they are not official partnerships.

## Try it

You need a NEAR **testnet** account in MyNearWallet or Meteor.

1. **Open the map** at https://neardistrict.quest/ and choose **Enter the world**.
2. **Browse the destinations.** Four demo missions are live, each showing its prize pool. Hover a pin, or open the Explore panel.
3. **Connect your wallet** with **Sign in**. NEAR District asks your wallet to sign a one-time message (NEP-413); no transaction is sent.
4. **Join a mission**, for example *The RHEA Liquidity Trail*, then **Start the mission**.
5. **Submit a sealed answer.** Type an answer and choose **Lock it in**. You'll see that it was saved, not whether it is correct, and you can change it until the deadline.
6. **Unlock a partner hint.** Open secret 2: the map moves to the partner's destination and shows its quest, *Wrap some NEAR into wNEAR* (`wrap.testnet::near_deposit`). Use **Open NEAR ↗**, wrap any small amount of testnet NEAR with the same wallet, then choose **I did it**.
7. **Watch the verification.** The backend finds your transaction through the NearBlocks indexer, confirms the final outcome through NEAR RPC (signer, receiver, method, success), and decrypts the hint.
8. **Explore the connected project.** Follow the other partner links on the map. Secret 3 points to LiNEAR's `deposit_and_stake`.
9. **Review results and rewards.** After a mission's deadline, results are revealed in the mission view. Paid prizes appear under **Progress → My rewards** with a link to the payout transaction.

## Inspect the on-chain evidence

**The vault and its missions.** Read the vault directly (no wallet needed):

```bash
near contract call-function as-read-only neardistrict-vault.testnet get_config json-args '{}' network-config testnet now
near contract call-function as-read-only neardistrict-vault.testnet get_mission json-args '{"mission_id":"18"}' network-config testnet now
```

The four live demo missions are vault missions **18–21**, holding 300, 200, 100 and 150 testnet USDC, each funded by its company's testnet wallet (`rhea.` / `near.` / `linear.` / `social.neardistrict-host.testnet`). Mission **22** is the warm-up mission: status `Completed`, 20 USDC paid.

**The payout transaction.** Open https://testnet.nearblocks.io/txns/FYjZA8bnawFjxuruGiSeN4FkVzrK6LSXrPtxzMS3aq53 and check:

- **Signer:** `neardistrict-ops.testnet` (the NEAR District operator), calling `payout` on `neardistrict-vault.testnet`.
- **Transfer:** a USDC transfer of `20000000` (20 USDC, 6 decimals) from `neardistrict-vault.testnet` to `neardistrict-player.testnet`.
- **Events:** the vault logs `reward_paid` and `mission_completed` (standard `near_district_prize_vault`).

The same data is available from any NEAR RPC with `EXPERIMENTAL_tx_status`.

## Run the tests

```bash
pnpm install
pnpm test                                # 120 TypeScript tests: core, NEAR, database, web, worker
docker compose run --rm contract-tests   # 15 prize vault contract tests
```

The worker suite exercises the payout driver end to end against a simulated vault:
- equal shares;
- a failed transfer that is retried;
- the remainder refund;
- the no-winner refund;
- a sealed-scoring race.

## Reproduce locally

1. Follow the Quick start in the [README](../README.md) to run PostgreSQL, the web app and the worker.
2. Seed the local demo with `pnpm --filter @near-district/web seed:demo`. Without a vault configured, missions are published with demo-tagged prizes. With `VAULT_CONTRACT_ID` set, see the operator steps below.
3. Sign in with a testnet wallet and play a mission as above.

## Operator-only steps

These require privileged testnet keys held by the operator and are **not** needed to review the product:

| Step | Needs |
|---|---|
| Deploy or upgrade the prize vault | Vault account key |
| Seed demo missions with on-chain prizes | Company wallet keys (`*.neardistrict-host.testnet`) |
| Settle missions and send payouts | Operator key (`neardistrict-ops.testnet`), held only by the worker |

Instructions: [Testnet deployment](operations/testnet-deploy.md).
