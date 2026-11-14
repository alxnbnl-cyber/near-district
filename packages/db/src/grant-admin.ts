/**
 * Grants a platform admin role to an existing user (by email or NEAR account). Run by an
 * operator with database access — there is deliberately no self-service path in the app.
 *   DATABASE_URL=... pnpm --filter @near-district/db grant-admin -- --email you@example.com --role superadmin
 *   DATABASE_URL=... pnpm --filter @near-district/db grant-admin -- --near alice.near --role moderator
 */
import { adminRoles, auditLogs, createDb, eq, sql, userIdentities, users } from "./index";

const args = process.argv.slice(2);
const get = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const role = (get("--role") ?? "superadmin") as "superadmin" | "finance" | "moderator" | "support";
if (!["superadmin", "finance", "moderator", "support"].includes(role)) throw new Error("invalid role");
const h = await createDb(process.env.DATABASE_URL!, { max: 1 });
let userId: string | undefined;
if (get("--email")) {
  userId = (await h.db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${get("--email")!.toLowerCase()}`))[0]?.id;
} else if (get("--near")) {
  userId = (await h.db.select({ id: userIdentities.userId }).from(userIdentities).where(sql`${userIdentities.provider} = 'near' and ${userIdentities.subject} like ${"%:" + get("--near")}`))[0]?.id;
}
if (!userId) {
  console.error("user not found — they must sign in once first");
  process.exit(1);
}
await h.db.insert(adminRoles).values({ userId, role }).onConflictDoNothing();
await h.db.insert(auditLogs).values({ actorUserId: null, action: "admin.role_granted_cli", targetType: "user", targetId: userId, metadata: { role } });
console.log(`granted ${role} to ${userId}`);
void eq;
await h.close();
