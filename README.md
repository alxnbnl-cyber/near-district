# NEAR District

**Explore, play and win on NEAR.** A map of NEAR ecosystem projects, where treasure hunts and creative challenges carry fixed prizes held in an on-chain vault and paid to players' NEAR wallets.

> The workspace packages are still named `@yielvy/*` internally; only the product name changed.

> Status: functional pre-release. Exploration, Spaces, Treasure Hunts, Creative Contests, admin and the background worker run locally. The vault contract is tested but **not deployed**; real-money funding is off until audit and your approval. See [`docs/status.md`](docs/status.md).

## Repository

```
apps/web          Next.js 16 app: world (PixiJS), explorer, organizer & admin portals, API
apps/worker       Durable Postgres job queue: reward periods, sealed-hunt scoring, payouts, reconciliation
packages/core     Pure domain logic: money (bigint), answers, equal-split rewards, merkle, state machines, world layout
packages/db       Drizzle schema, migrations (append-only triggers), PGlite test DB
packages/near     NEAR RPC, NEAR activity checks, NEP-413 verification, vault events
contracts/vault   NEAR smart contract (Rust): per-campaign prize escrow (legacy yield code kept, unused)
docs/             Architecture, security, operations, deployment, compliance, assets, status
```

## Quick start (local)

```bash
pnpm install
cp .env.example apps/web/.env.local      # fill secrets (see comments)
POSTGRES_PASSWORD=... docker compose up -d postgres
DATABASE_URL=postgres://yielvy:...@127.0.0.1:54329/yielvy pnpm db:migrate
pnpm dev                                  # web on http://localhost:3210
pnpm dev:worker                           # worker (same env vars)
```

Email sign-in prints the magic link to the server log in development. Grant yourself admin after signing in once:

```bash
DATABASE_URL=... pnpm --filter @yielvy/db grant-admin -- --email you@example.com
```

## Tests

```bash
pnpm test                                 # core, db, near, web engine, worker (PGlite — no services needed)
docker compose run --rm contract-tests    # vault contract (or: pnpm test:contract with a Rust toolchain)
pnpm verify:live                          # read-only checks against NEAR mainnet + 1Click
```

## Read next
- [Architecture & money flow](docs/architecture/overview.md)
- [Vault design](docs/architecture/vault.md) · [Randomness](docs/architecture/randomness.md) · [Verified external facts](docs/architecture/external-verification.md)
- [Threat model](docs/security/threat-model.md) · [Keys](docs/security/key-management.md)
- [Mainnet verification](docs/operations/mainnet-verification.md) · [Incident response](docs/operations/incident-response.md)
- [Deployment](docs/deployment/deploy.md) · [Launch gates](docs/compliance/launch-gates.md) · [World art](docs/assets/world-art.md)

Brand name is provisional pending trademark and domain clearance.
