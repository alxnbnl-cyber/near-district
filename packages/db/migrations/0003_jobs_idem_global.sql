-- Earlier versions only de-duplicated pending/running jobs, so finished duplicates may exist.
-- Keep the newest row per idempotency key before enforcing global uniqueness.
DELETE FROM "jobs" a
USING "jobs" b
WHERE a."idempotency_key" IS NOT NULL
  AND a."idempotency_key" = b."idempotency_key"
  AND (a."created_at", a."id") < (b."created_at", b."id");
--> statement-breakpoint
DROP INDEX "jobs_idem_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idem_uq" ON "jobs" USING btree ("idempotency_key");
