import { redirect } from "next/navigation";
import { and, desc, eq, gt, isNull, sessions, walletConnections } from "@yielvy/db";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { Badge, Card, SectionHeader } from "@/components/ui";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { LinkWallet, RevokeSessions } from "./ProfileActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile & wallet" };

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/me/profile");
  const database = await db();
  const wallets = await database.select().from(walletConnections).where(eq(walletConnections.userId, user.userId));
  const active = await database
    .select({ id: sessions.id, ua: sessions.userAgent, createdAt: sessions.createdAt })
    .from(sessions)
    .where(and(eq(sessions.userId, user.userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.createdAt));
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
        <div>
          <h1 className="text-3xl font-semibold">{user.displayName}</h1>
          {user.email && <p className="text-ink-2">{user.email}</p>}
        </div>
        <section>
          <SectionHeader title="Payout wallet" />
          <Card className="p-5">
            {wallets.length === 0 ? (
              <p className="text-sm text-ink-2">No wallet linked. You need one to receive token rewards.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {wallets.map((w) => (
                  <li key={w.id} className="flex items-center gap-3">
                    <span className="font-mono text-sm">{w.accountId}</span>
                    <Badge>{w.network}</Badge>
                    {w.isPayout && <Badge tone="mint">Payout</Badge>}
                    <span className="text-[12px] text-ink-3">verified {w.verifiedAt.toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <LinkWallet network={env().NEAR_NETWORK} />
            </div>
          </Card>
        </section>
        <section>
          <SectionHeader title="Signed-in devices" />
          <Card className="divide-y divide-line">
            {active.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink-2">{s.ua ?? "Unknown device"}</span>
                {s.id === user.sessionId && <Badge tone="sky">This device</Badge>}
                <span className="text-[12px] text-ink-3">{s.createdAt.toLocaleDateString()}</span>
              </div>
            ))}
          </Card>
          <div className="mt-3">
            <RevokeSessions />
          </div>
        </section>
      </main>
    </>
  );
}
