# NEAR District: todo

Operations, legal and hosting tasks. Product roadmap: [docs/roadmap.md](docs/roadmap.md).

## Accounts and keys
- [x] Testnet accounts: vault (`neardistrict-vault.testnet`), operator (`neardistrict-ops.testnet`), demo company wallets, demo player wallet
- [ ] Set up the owner multisig for mainnet (2 of 3 hardware wallets recommended)
- [ ] Get a paid NEAR RPC provider (mainnet + testnet)
- [ ] NearBlocks API key for hint verification at higher volume (`NEARBLOCKS_API_KEY`)

## Testing
- [ ] Look at the map on a phone and a low-end laptop (`/?perf=1` shows fps)
- [ ] Automated browser end-to-end tests

## Before any real money
- [ ] Independent smart-contract audit of `contracts/prize-vault`
- [ ] Small-value mainnet run following `docs/operations/mainnet-verification.md` (approve each step)
- [ ] Remove the vault account's full-access key after a mainnet deploy
- [ ] Legal review per target country (`docs/compliance/launch-gates.md`): custody, AML and sanctions, KYC thresholds, prize rules, tax
- [ ] Draft user terms, organizer terms, risk disclosure, privacy policy
- [ ] Sanctions screening for sponsor and winner wallets

## Product and brand
- [ ] Trademark and domain clearance for "NEAR District"
- [ ] Commission building, prop and mascot art (specs in `docs/assets/world-art.md`)
- [ ] Decide the commercial model (see `docs/ECONOMICS.md`)

## Hosting
- [x] Web, worker and Postgres on Railway; domain `neardistrict.quest`
- [ ] Persistent volume or object storage for host uploads
- [ ] Error tracking, log shipping and alerts (reconciliation discrepancy, dead jobs, low operator balance)
- [ ] One backup-restore drill
- [ ] CI: tests, `pnpm audit`, `cargo audit`, secret scanning

## Hint quests and expeditions (see `docs/architecture/hints-and-expeditions.md`)
- [ ] Legal review: financial hints always need a free alternative in funded missions (enforced); confirm this is enough per country
- [ ] Decide whether to build USD thresholds (needs a price source) and LP, holding or NFT adapters
- [ ] Meteor attribution: ask Meteor for a verifiable attribution method before offering "Swap using Meteor"
- [ ] Teammate invitations (editor and reviewer roles)
