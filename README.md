# NEAR District

**Explore. Play. Earn.** A map of NEAR ecosystem projects. Projects host mystery missions with fixed prizes, explorers decrypt sealed secrets, and partner hints unlock through verified on-chain NEAR activity. Everyone who solves every secret before the deadline shares the prize equally.

**On-chain prizes (NEAR testnet):** projects lock each prize in the NEAR District prize vault (`neardistrict-vault.testnet`). After the deadline, the contract pays every winner an equal share straight to their NEAR wallet, and refunds any remainder to the project. Prizes use testnet USDC (`usdc.fakes.testnet`). See [`docs/architecture/prize-vault.md`](docs/architecture/prize-vault.md).

> Status: hackathon build on NEAR testnet. Mainnet needs an audit of `contracts/prize-vault` first. Internal workspace packages are still named `@near-district/*`.

## Repository

```
apps/web          Next.js 16 app: world (PixiJS), explorer, organizer & admin portals, API
apps/worker       Durable Postgres job queue: reward periods, sealed-hunt scoring, payouts, reconciliation
packages/core     Pure domain logic: money (bigint), answers, equal-split rewards, merkle, state machines, world layout
packages/db       Drizzle schema, migrations (append-only triggers), PGlite test DB
packages/near     NEAR RPC, NEAR activity checks, NEP-413 verification, prize vault client and events
contracts/prize-vault  NEAR smart contract (Rust): fixed-prize escrow with automatic equal-share payouts
docs/             Architecture, security, operations, deployment, compliance, assets, status
```

## Quick start (local)

```bash
pnpm install
cp .env.example apps/web/.env.local      # fill secrets (see comments)
POSTGRES_PASSWORD=... docker compose up -d postgres
DATABASE_URL=postgres://neardistrict:...@127.0.0.1:54329/neardistrict pnpm db:migrate
pnpm dev                                  # web on http://localhost:3210
pnpm dev:worker                           # worker (same env vars)
```

Email sign-in prints the magic link to the server log in development. Grant yourself admin after signing in once:

```bash
DATABASE_URL=... pnpm --filter @near-district/db grant-admin -- --email you@example.com
```

## Tests

```bash
pnpm test                                 # core, db, near, web engine, worker (PGlite — no services needed)
docker compose run --rm contract-tests    # prize vault contract (or: pnpm test:contract with a Rust toolchain)
pnpm verify:live                          # read-only checks against NEAR mainnet + 1Click
```

## Read next
- [Architecture & money flow](docs/architecture/overview.md)
- [Prize vault](docs/architecture/prize-vault.md) · [Testnet deployment](docs/operations/testnet-deploy.md) · [Verified external facts](docs/architecture/external-verification.md)
- [Threat model](docs/security/threat-model.md) · [Keys](docs/security/key-management.md)
- [Mainnet readiness](docs/operations/mainnet-verification.md) · [Incident response](docs/operations/incident-response.md)
- [Deployment](docs/deployment/deploy.md) · [Launch gates](docs/compliance/launch-gates.md) · [World art](docs/assets/world-art.md)

Brand name is provisional pending trademark and domain clearance.
