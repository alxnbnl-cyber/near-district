# NEAR District — new direction review

**One-line product:** a game map of the NEAR ecosystem. NEAR projects host missions with a fixed prize; players sign in with a NEAR wallet, solve the mission before the deadline, and everyone who answered correctly splits the prize, paid straight to their NEAR wallet.

## The new rules

| Area | Before | NEAR District |
|---|---|---|
| Name | Yielvy | **NEAR District** |
| Audience | Web2 + Web3, any chain | **NEAR ecosystem only** |
| Sign in | Google/email (NEAR Auth), email link, NEAR, EVM, Solana wallets | **NEAR wallets only** (Meteor, MyNearWallet) |
| Prize | Growing (yield on RHEA) or fixed | **Fixed prize only** |
| Funding | Deposit principal + RHEA lending, 1Click cross-chain | **Company deposits the fixed prize (USDC) from a NEAR wallet** |
| Winners | 4 modes (equal, top scorers, organizer pick, random draw) | **One method: everyone who answered every clue correctly splits the prize equally, at the deadline** |
| Payout | NEAR wallet, EVM/Solana via Intents, cash-out to bank | **Straight to the winner's NEAR wallet (automatic)** |

## What stays (already fits)

- Game map, pins with company logos, mission modal (Mission / Company tabs), timeline, Progress panel
- Sealed treasure hunts: answers editable until the deadline, revealed and scored at the end (this is exactly the new reward trigger)
- Host console: profile → approval → mission setup → fund → go live; partners inside mission setup (NEAR projects teaming up)
- NEAR-native hint activities: swap on RHEA, supply to RHEA Lending, stake NEAR, sign in with Meteor, finish another mission, reviewed contribution
- Vault payouts with `claim_for` + worker auto-payout to the winner's NEAR wallet
- Testnet mode (USDC.e on testnet)

## What gets removed

### Sign-in and identity
- NEAR Auth (Google / email): `lib/near-auth.ts`, `server/near-auth.ts`, `/api/auth/near-auth`, the `@fast-auth-near/*` packages
- Email magic link: `/api/auth/email/*`, sign-in email tab, Resend/email settings
- EVM / Solana wallets: sign-in, linking, payout destination (`external-wallets` server + client, `/api/auth/wallet/*`, `/api/wallets/external/*`, `/api/me/payout`, `PayoutCard`), `packages/near/src/external-wallets.ts`
- DB: `external_wallets` table, `users.payout_destination`, `near_auth` identity (drop in a migration)

### Yield mechanism
- App: growing prize pools (`LiveReward` ticking, `rewardRate`, APY, "+$x/day"), interest-prize option in setup, "interest deposit" in funding, yield explainer in tutorial / how-it-works / prize pool, RHEA lending client use for prizes, economics estimate panel, demo APYs
- Contract: kept as is (decision 2); the app only uses the fixed-prize path: **create campaign → fund prize → at the deadline commit winners → winners paid → sponsor withdraws any unclaimed remainder**
- Worker: vault supply / harvest / snapshot jobs for yield
- Schema/rules: `fundingSource` collapses to "fixed" (keep a single funded flag)

### Multichain / Web2
- NEAR Intents / 1Click (cross-chain funding and payouts, Intents prize route)
- Cash-out / offramp (`CashOut`, `/api/me/offramp`, `/api/me/wallet` cash-out parts, `OFFRAMP_ACCOUNT_ID`)
- EVM / Solana activity checks (`other-chains.ts`, catalogue entries)
- Web2 partner app events (app keys, link codes, `/api/partner/*`, Settings → App events, `partner_*` tables)

### Reward modes
- Remove top scorers and random draw (+ `RANDOM_DRAW_ALLOWED_COUNTRIES`). Hunts: equal split among all players with every clue correct (no winners count). Contests: company picks winners, equal split.

## Rename to NEAR District

- Visible text: page titles/metadata, homepage, HUD title ("YIELVY" → "NEAR DISTRICT"), sign-in, tutorial, host console, emails, docs/README
- Assets: new logo/wordmark needed (current `yielvy-logo.webp` / `yielvy-mark.webp` contain the Yielvy brand) — provide new art, or a temporary text wordmark
- Domain/strings: `yielvy.app` links, sign-in message text ("Sign in to Yielvy")
- Internal package names (`@yielvy/*`), DB name, contract crate name can stay for now (not user-visible); rename later if wanted

## Decisions (2026-11-12)

1. **Creative contests stay.** The company picks the winners and the fixed prize is split equally among them. Treasure hunts use the automatic rule: everyone with every clue correct splits the prize.
2. **Vault contract keeps its yield code, unused.** The app only ever funds a fixed prize (the vault's bonus path); supply/harvest/redeem are never called.
3. **Local data is wiped and reseeded** with the RHEA, NEAR and Meteor demo missions on fixed prizes.

## Suggested order

1. Remove sign-in options (NEAR wallets only) and multichain/Web2 code
2. Fixed prize only in app + single equal-split rule
3. Rebuild the vault with `cargo near` (code unchanged) and deploy
4. Rename to NEAR District (text now, logo when art is ready)
5. Reseed the three demo missions with fixed prizes, fund on testnet, full end-to-end run

## Status (2026-11-12)

Done:
- Sign-in is NEAR wallets only (Meteor, MyNearWallet). Google/email, EVM and Solana are removed, along with their routes, tables and tests.
- Prizes are fixed only. The app has no yield UI, ticking rewards, APY, interest deposit, economics panel or harvest step. The worker reserves only the deposited prize.
- One reward rule. Hunts split the prize equally among everyone who answered every clue correctly; contests split it equally among the winners the company picks. The top-scorers mode, random draws (with their seed and randomness module) and rank shares are gone.
- NEAR only. The 1Click/Intents code (worker poll, client, env) and app events are removed.
- The product is renamed to NEAR District: titles, HUD, sign-in message, help, tutorial and README, with a temporary vector mark and text wordmark (`components/brand/Logo.tsx`, `app/icon.svg`). Protocol identifiers stay unchanged: `yielvy_vault` events, `yielvy-eligibility-v1`, and the package names `@yielvy/*`.
- Migration `0011_near_district_cleanup` drops the external_wallets, partner_*, email_login_tokens and users.payout_destination tables and columns, plus jurisdiction_rules.random_draw_allowed.
- `pnpm --filter @yielvy/web seed:demo` (local only) wipes the database and seeds RHEA (hunt, 300 USDC), NEAR (contest, 3 winners, 500 USDC) and Meteor (hunt, 200 USDC). With no vault deployed, these missions show their planned prize tagged DEMO.

Still open:
- Vault wasm build and testnet deploy (cargo-near toolchain issue). Until it is fixed, real prizes can't be funded.
- Final logo art.
