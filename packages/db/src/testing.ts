/** Fresh, fully migrated in-memory Postgres (PGlite) for integration tests. */
import { createDb, type DbHandle } from "./index";
import { runMigrations } from "./migrate";

export async function createTestDb(): Promise<DbHandle> {
  const url = "pglite://memory";
  const h = await createDb(url);
  await runMigrations(h.db, url);
  return h;
}
