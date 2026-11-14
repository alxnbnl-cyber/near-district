import "server-only";
import { rateLimits, sql, type Db } from "@near-district/db";

export class RateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many attempts. Please wait a moment and try again.");
  }
}

/**
 * Fixed-window counter in Postgres (atomic upsert). Throws RateLimitError when exceeded.
 * Keys should be namespaced, e.g. `answer:${userId}:${questionId}`.
 */
export async function rateLimit(db: Db, key: string, limit: number, windowSeconds: number): Promise<void> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count });
  if ((row?.count ?? 0) > limit) {
    const retry = Math.ceil((windowStart.getTime() + windowSeconds * 1000 - now) / 1000);
    throw new RateLimitError(Math.max(1, retry));
  }
}
