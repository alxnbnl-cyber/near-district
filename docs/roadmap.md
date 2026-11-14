# NEAR District roadmap

Where NEAR District is today and where it is going. Current state: [status.md](status.md). Operations and hosting tasks: [todo.md](../todo.md).

## ✅ Live on NEAR Testnet

- [x] District map with painted artwork, company logo pins, minimap, zoom and dock
- [x] Missions open over the map with Mission and Company tabs, prize pool card and timeline
- [x] Sealed answers: every secret open, answers editable until the deadline, results revealed after it
- [x] Creative Challenges with team-selected winners
- [x] Host console: profile → approval → funding → missions, with partners inside mission setup
- [x] NEAR wallet sign-in (MyNearWallet, Meteor)
- [x] Verified on-chain hints: contract calls, RHEA swap, RHEA Lending supply, staking, Meteor sign-in
- [x] Partner hints and multi-project expeditions
- [x] Prize vault on testnet (`neardistrict-vault.testnet`): fixed-prize escrow, equal shares, automatic payouts, sponsor refunds
- [x] Four funded demo missions (750 testnet USDC) and a settled warm-up mission paid on-chain
- [x] Progress panel: explorer rank, joined missions, paid rewards with transaction links

## ⏭ Next: polish

- [ ] Creative Challenges: allow entries to be edited until the deadline (as missions do)
- [ ] Tune the results reveal screen
- [ ] Higher-resolution map artwork for maximum zoom
- [ ] Automated browser end-to-end tests
- [ ] Teammate invitations for project teams

## 🔭 Later

- [ ] **Product Explorer** mission type
- [ ] **Organizer analytics:** player journeys across partner missions, hint completions, retention
- [ ] **More verified activities:** liquidity provision, NFT ownership, asset holding (each needs a reviewed adapter)
- [ ] **Multi-sponsor prizes:** several projects co-funding one expedition prize (needs a vault change and review)
- [ ] **Commercial model:** campaign hosting fees and premium organizer tools (see [ECONOMICS.md](ECONOMICS.md))
- [ ] **Mainnet launch:** independent contract audit, then a small-value run following [mainnet-verification.md](operations/mainnet-verification.md)
