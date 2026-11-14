/**
 * Durable Postgres job queue. Chosen over Redis/BullMQ deliberately: jobs are enqueued in the
 * same database transaction as the business change that causes them (no lost or phantom jobs),
 * and a solo operator runs one fewer stateful service.
 *
 * Guarantees:
 *  - at-least-once execution; handlers MUST be idempotent (all of ours re-read state first)
 *  - concurrent workers never run the same job (FOR UPDATE SKIP LOCKED)
 *  - a crashed worker's job is reclaimed after its lock expires
 *  - bounded exponential backoff, then `dead` (surfaced in the admin portal)
 *  - idempotency keys de-duplicate pending/running jobs
 */
import { jobs, sql, type Db, type Tx } from "@near-district/db";

export interface EnqueueOptions {
  runAt?: Date;
  idempotencyKey?: string;
  maxAttempts?: number;
}

export async function enqueue(db: Db | Tx, name: string, payload: object = {}, opts: EnqueueOptions = {}): Promise<boolean> {
  const rows = await db
    .insert(jobs)
    .values({ name, payload, runAt: opts.runAt ?? new Date(), idempotencyKey: opts.idempotencyKey ?? null, maxAttempts: opts.maxAttempts ?? 8 })
    .onConflictDoNothing()
    .returning({ id: jobs.id });
  return rows.length > 0;
}

export interface ClaimedJob {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

export async function claim(db: Db, workerId: string, limit = 5, lockSeconds = 120): Promise<ClaimedJob[]> {
  const res = await db.execute(sql`
    update jobs set status = 'running', locked_by = ${workerId},
      locked_until = now() + make_interval(secs => ${lockSeconds}), attempts = attempts + 1, updated_at = now()
    where id in (
      select id from jobs
      where (status = 'pending' and run_at <= now())
         or (status = 'running' and locked_until < now())
      order by run_at
      for update skip locked
      limit ${limit}
    )
    returning id, name, payload, attempts, max_attempts`);
  const rows = ((res as { rows?: unknown[] }).rows ?? (res as unknown as unknown[])) as {
    id: string;
    name: string;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
  }[];
  return rows.map((r) => ({ id: r.id, name: r.name, payload: r.payload, attempts: r.attempts, maxAttempts: r.max_attempts }));
}

export async function complete(db: Db, id: string): Promise<void> {
  await db.execute(sql`update jobs set status = 'done', locked_by = null, locked_until = null, updated_at = now() where id = ${id}`);
}

/** Backoff: 15s, 30s, 1m, 2m, 4m … capped at 30 minutes. */
export function backoffSeconds(attempt: number): number {
  return Math.min(1800, 15 * 2 ** Math.max(0, attempt - 1));
}

export async function fail(db: Db, job: ClaimedJob, err: unknown, opts: { retryInSeconds?: number } = {}): Promise<"retry" | "dead"> {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
  if (job.attempts >= job.maxAttempts) {
    await db.execute(sql`update jobs set status = 'dead', last_error = ${message}, locked_by = null, locked_until = null, updated_at = now() where id = ${job.id}`);
    return "dead";
  }
  const delay = opts.retryInSeconds ?? backoffSeconds(job.attempts);
  await db.execute(sql`
    update jobs set status = 'pending', last_error = ${message}, locked_by = null, locked_until = null,
      run_at = now() + make_interval(secs => ${delay}), updated_at = now()
    where id = ${job.id}`);
  return "retry";
}

/** A handler can ask to be re-run later without counting as a failure (e.g. waiting for finality). */
export class RetryLater extends Error {
  constructor(readonly seconds: number, reason: string) {
    super(reason);
  }
}

export async function reschedule(db: Db, job: ClaimedJob, seconds: number, note: string): Promise<void> {
  await db.execute(sql`
    update jobs set status = 'pending', attempts = greatest(attempts - 1, 0), last_error = ${note}, locked_by = null,
      locked_until = null, run_at = now() + make_interval(secs => ${seconds}), updated_at = now()
    where id = ${job.id}`);
}
