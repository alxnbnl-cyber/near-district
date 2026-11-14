# Deployment

Recommended for a solo operator:

| Piece | Host | Notes |
|---|---|---|
| Web (Next.js) | Railway / Fly / Render (Docker `Dockerfile.web`) | Needs dynamic rendering (nonce CSP). Cloudflare in front for CDN + `cf-ipcountry`. |
| Worker | Railway service (`Dockerfile.worker`), **1 replica** to start | Multiple replicas are safe (SKIP LOCKED + idempotency) but unnecessary. |
| Postgres | Managed (Railway, Neon, Supabase) with PITR backups | Postgres 15+. |
| Uploads | Volume mounted at `UPLOAD_DIR`, or replace `localStorageAdapter` with S3/R2 | Serve through the app (keeps CSP/nosniff headers). |
| RPC | Paid NEAR RPC primary + public fallback | `NEAR_RPC_URLS=primary,fallback` |
| Errors / logs | Worker and web log JSON lines; ship to Better Stack / Datadog; Sentry optional | |

## Release procedure
```bash
pnpm install --frozen-lockfile
pnpm test && pnpm typecheck && pnpm test:contract
DATABASE_URL=$PROD_DATABASE_URL pnpm db:migrate     # release step, before new code serves traffic
# deploy web + worker images
```
Migrations are additive-first; destructive changes ship in a later release after code no longer uses the column.

## Health checks
- Web: `GET /api/health` (DB reachable)
- Worker: `GET :8081/` (loop alive within 60 s)

## Rollback
- App: redeploy the previous image (both services). Migrations are backwards-compatible within one release.
- Database: restore PITR snapshot to a new instance, verify, then switch `DATABASE_URL`. Chain state is authoritative — after restore, run the worker's ledger indexer and reconciliation to catch up.
- Contract: no instant rollback by design. Propose the previous code hash via the timelock, or pause.

## Backups
- Managed daily snapshots + point-in-time recovery (≥7 days).
- Weekly logical dump to separate storage: `pg_dump --format=custom $DATABASE_URL > near-district-$(date +%F).dump`
- Quarterly restore drill into a scratch database; run `pnpm --filter @yielvy/db test` against it.
