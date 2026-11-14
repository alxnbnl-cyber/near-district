# NEAR District — todo

## Accounts & keys (only you can do these)
- [ ] Create NEAR **testnet** accounts: vault, owner (multisig), operator, guardian, sponsor test wallet, winner test wallet
- [ ] Find RHEA's testnet lending contract + testnet USDC, then run `pnpm verify:live --network testnet`
- [ ] Set up the owner multisig (2-of-3 hardware wallets recommended)
- [ ] Generate the operator function-call key and store it in a secret manager (never in git)
- [ ] Get a paid NEAR RPC provider (mainnet + testnet)
- [ ] Get a 1Click JWT (optional, lowers fees)
- [ ] Set up Resend (or another email provider) + `EMAIL_FROM` domain

## Testing I can't do without you
- [ ] Sign in with a real NEAR wallet (MyNearWallet + Meteor) and link a wallet in Profile
- [ ] Approve a **testnet** vault deploy, then run the full lifecycle: register → deposit → supply → harvest → reserve → finalize → claim → exit
- [ ] Look at the world on a phone and a low-end laptop with the browser visible (`/?perf=1` shows fps)
- [ ] Try one real small cross-chain deposit on testnet/mainnet after the vault exists

## Before any real money
- [ ] Independent smart-contract audit of `contracts/vault`
- [ ] Small-value mainnet run following `docs/operations/mainnet-verification.md` (approve each step)
- [ ] Remove the vault account's full-access key after deploy
- [ ] Legal review per target country (`docs/compliance/launch-gates.md`): custody, AML/sanctions, KYC thresholds, prize rules, tax
- [ ] Draft user terms, organizer terms, risk disclosure, privacy policy
- [ ] Decide which countries (if any) allow random draws → `RANDOM_DRAW_ALLOWED_COUNTRIES`

## Product & brand
- [ ] Trademark + domain clearance for "NEAR District"
- [ ] Commission building / prop / mascot art (specs in `docs/assets/world-art.md`)
- [ ] Final platform fee (currently 10% of collected yield in the economics estimate)

## Hosting
- [ ] Pick hosts (web, worker, managed Postgres with backups, object storage for uploads)
- [ ] Set production env vars from `.env.example`
- [ ] Set up error tracking + log shipping + alerts (reconciliation discrepancy, dead jobs, low operator balance)
- [ ] Do one backup-restore drill

## Remaining dev work (ask me)
- [ ] Automated Playwright end-to-end tests
- [ ] 1Click quote-signature verification
- [ ] Sanctions screening for sponsor/winner wallets
- [ ] Teammate invites (editor/reviewer roles)
- [ ] CI: tests, `pnpm audit`, `cargo audit`, secret scanning

## Hint quests & expeditions (see `docs/architecture/hints-and-expeditions.md`)
- [ ] On-chain hint activities (RHEA swap / lending) only verify on a **mainnet** deployment — players must prove mainnet wallet ownership
- [ ] Legal review: hints that need a financial activity always need a free alternative in funded campaigns (enforced); confirm this is enough per country
- [ ] Decide whether to build: partner-signed API events (needs per-partner keys + consent), USD thresholds (needs a price source), LP / holding / NFT adapters
- [ ] Meteor attribution: ask Meteor for a verifiable attribution method before offering "Swap using Meteor"
- [ ] Multi-sponsor expedition prize reserves — only after the vault accounting is reviewed for shared principal

## My notes
- [ ] 
