# Yielvy roadmap

Product roadmap for the testnet demo and beyond. Operations, legal and hosting tasks live in [`todo.md`](../todo.md).

## ✅ Done

- [x] Game map: painted world, logo pins, ambient traffic/clouds/lights, glitching grid, minimap, zoom, dock
- [x] Missions open in a modal over the map (pin click zooms in, then opens), with Mission / Company tabs
- [x] Prize pool card (growing vs fixed) and mission timeline
- [x] Sealed answers: every clue open, answers editable until the deadline, never says right or wrong before the end
- [x] Deadline: answers lock, results and explanations revealed, players scored and qualified automatically
- [x] Host console: profile → approval → funding → missions, demo auto-approve, partners inside mission setup
- [x] Sign in as a modal over the map (full page from the homepage)
- [x] Progress panel: explorer rank, rewards, missions, testnet cash-out (bank payout simulated)
- [x] NEAR testnet mode: testnet RHEA lending + USDC.e, live checks passing
- [x] On-chain hint activities: swap on RHEA, supply to RHEA Lending, stake NEAR, sign in with Meteor Wallet
- [x] Vault `claim_for` + worker auto-payout to winners' wallets
- [x] EVM + Solana wallet connect (MetaMask/Rabby, Phantom) with signed ownership proof
- [x] "Receive prizes on": NEAR wallet, Base / Arbitrum / Ethereum, or Solana (cross-chain hop simulated on testnet)
- [x] Activity checks on other chains: EVM contract calls (Sepolia, Base Sepolia, Ethereum, Base), Solana program calls (devnet, mainnet)
- [x] Web2 company activities: signed app events with player-consented link codes (Settings → App events)

## 🚧 Now: testnet demo

- [ ] Build the vault with `cargo near build` (current toolchain output traps on testnet)
- [ ] Deploy + initialise the vault on testnet (accounts `yielvy-*-31c867.testnet` already created)
- [ ] Mint test USDC.e for funding
- [ ] Seed the three demo missions
  - [ ] **RHEA**: treasure hunt, growing reward from a $10,000 yield deposit, RHEA swap / lending hints
  - [ ] **NEAR**: creative contest, fixed $100 reward
  - [ ] **Meteor → RHEA → NEAR Intents**: treasure hunt, growing reward from a $20,000 yield deposit, Meteor sign-in hint
- [ ] End-to-end demo run: solve → qualify → auto-paid → cash out
- [ ] Commit the sealed-answers / payouts / activities work

## ⏭ Next: polish

- [ ] Creative contests: let entries be edited until the deadline (same as hunts)
- [ ] Play a sealed hunt end to end in the browser and tune the reveal screen
- [ ] `pnpm dev:clean` script for the dev-server refresh loop
- [ ] Dedicated icons for Cooperation and How it works
- [ ] Higher-resolution map artwork (max zoom looks soft)

## 🌐 Multichain & Web2 (next up)

- [ ] **Embedded wallets for Web2 players**: email sign-up creates a NEAR (implicit) wallet automatically (needs a provider account: Web3Auth / Privy, NEAR support to confirm)
- [ ] **Card / bank funding for Web2 companies**: fiat on-ramp into the vault (needs an on-ramp provider sandbox key)
- [ ] **Cross-chain deposits & payouts via NEAR Intents**: real on mainnet; shown as simulated on testnet

## 🔭 Later

- [ ] Wallet-less winners: custodial per-user sub-accounts so email users can win and cash out without creating a wallet
- [ ] Multi-sponsor funding (several companies co-funding one prize pool), after a vault accounting review
- [ ] Real fiat offramp partner (replaces the simulated bank payout)
- [ ] Mainnet launch: see "Before any real money" in [`todo.md`](../todo.md)
