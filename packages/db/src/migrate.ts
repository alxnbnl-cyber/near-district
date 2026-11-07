import { fileURLToPath } from "node:url";
import path from "node:path";
import { createDb, type Db } from "./index";

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

export async function runMigrations(db: Db, url: string): Promise<void> {
  if (url.startsWith("pglite://")) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder: MIGRATIONS_DIR });
  } else {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db as never, { migrationsFolder: MIGRATIONS_DIR });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const h = await createDb(url, { max: 1 });
  await runMigrations(h.db, url);
  await h.close();
  console.log("migrations applied");
}
