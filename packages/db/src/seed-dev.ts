/**
 * LOCAL DEVELOPMENT ONLY: creates clearly labelled "[dev]" Spaces so the world renderer can be
 * exercised with many buildings. It refuses to run against anything but a localhost database,
 * and it creates no campaigns, balances or activity — nothing that could pass as real data.
 *
 *   DATABASE_URL=... pnpm --filter @yielvy/db seed-dev -- --count 40
 *   DATABASE_URL=... pnpm --filter @yielvy/db seed-dev -- --remove
 */
import { createDb, organizations, spaces, users, eq, sql } from "./index";
import { assignBuildingPlot } from "./world";
import { SPACE_CATEGORIES } from "@yielvy/core";

const url = process.env.DATABASE_URL ?? "";
const host = url.startsWith("pglite://") ? "pglite" : new URL(url).hostname;
if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "pglite"].includes(host)) {
  console.error("seed-dev refuses to run outside a local development database.");
  process.exit(1);
}

const STYLES = ["workshop", "tower", "market", "atelier", "observatory", "pavilion"];
const args = process.argv.slice(2);
const count = Number(args[args.indexOf("--count") + 1] ?? 24) || 24;
const h = await createDb(url, { max: 1 });

if (args.includes("--link-wallet")) {
  // Local UI testing only: marks a local user as having a verified wallet without a signature.
  // The real app path ALWAYS requires a NEP-413 signature + full-access-key check.
  const email = args[args.indexOf("--link-wallet") + 1]!;
  const [u] = await h.db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  if (!u) throw new Error("user not found");
  await h.db.execute(
    sql`insert into wallet_connections (user_id, network, account_id, public_key, is_payout, verified_at)
        values (${u.id}, 'mainnet', ${"dev-fixture-" + u.id.slice(0, 8) + ".near"}, 'ed25519:dev-fixture-not-a-real-key', true, now())
        on conflict do nothing`,
  );
  console.log("linked dev fixture wallet (local database only)");
  await h.close();
  process.exit(0);
}

if (args.includes("--remove")) {
  const res = await h.db.execute(sql`delete from organizations where slug like 'dev-%'`);
  console.log("removed dev organizations", (res as { rowCount?: number }).rowCount ?? "");
  await h.close();
  process.exit(0);
}

const [owner] = await h.db
  .insert(users)
  .values({ displayName: "[dev] seed", email: "dev-seed@localhost.invalid" })
  .onConflictDoNothing()
  .returning();
const ownerId = owner?.id ?? (await h.db.select({ id: users.id }).from(users).where(eq(users.email, "dev-seed@localhost.invalid")))[0]!.id;

for (let i = 0; i < count; i++) {
  const slug = `dev-${Date.now().toString(36)}-${i}`;
  const category = SPACE_CATEGORIES[i % SPACE_CATEGORIES.length]!;
  await h.db.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({ name: `[dev] Space ${i + 1}`, slug, status: "approved", createdBy: ownerId }).returning();
    const [space] = await tx
      .insert(spaces)
      .values({
        organizationId: org!.id,
        name: `[dev] Space ${i + 1}`,
        slug,
        tagline: `Development placeholder (${category})`,
        category,
        buildingStyle: STYLES[i % STYLES.length]!,
        moderation: "approved",
      })
      .returning();
    await assignBuildingPlot(tx, space!.id, category);
  });
}
console.log(`created ${count} [dev] spaces`);
await h.close();
