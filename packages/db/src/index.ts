import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export * from "./schema";
export { schema };
export { sql, eq, and, or, desc, asc, inArray, isNull, isNotNull, gt, gte, lt, lte, ne, count } from "drizzle-orm";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
/** A transaction handle has the same query API as Db. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface DbHandle {
  db: Db;
  close(): Promise<void>;
}

/**
 * Production / local dev: a real Postgres URL (postgres://…).
 * Tests: "pglite://memory" runs real Postgres compiled to WASM, in-process.
 */
export async function createDb(url: string, opts: { max?: number } = {}): Promise<DbHandle> {
  if (url.startsWith("pglite://")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const path = url.slice("pglite://".length);
    const client = path === "memory" ? new PGlite() : new PGlite(path);
    return { db: drizzle(client, { schema }) as unknown as Db, close: () => client.close() };
  }
  const pg = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new pg.default.Pool({
    connectionString: url,
    max: opts.max ?? 10,
    statement_timeout: 30_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  return { db: drizzle(pool, { schema }) as unknown as Db, close: () => pool.end() };
}

let shared: Promise<DbHandle> | undefined;

/** Process-wide singleton for the web app and worker. */
export function getDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  shared ??= createDb(url);
  return shared.then((h) => h.db);
}
export { assignBuildingPlot } from "./world";
