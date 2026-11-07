import { redirect } from "next/navigation";
import { eq, organizationMembers, users } from "@yielvy/db";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { myOrganization } from "@/server/spaces";
import { Badge, Card, SectionHeader } from "@/components/ui";

export const metadata = { title: "Settings" };

export default async function OrganizerSettings() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer/settings");
  const database = await db();
  const mine = await myOrganization(database, user.userId);
  if (!mine?.space) redirect("/organizer");
  const members = await database
    .select({ role: organizationMembers.role, name: users.displayName, email: users.email })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, mine.org.id));
  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionHeader eyebrow="Settings" title={mine.org.name} />
        <Card className="p-5 text-sm">
          <p><span className="text-ink-3">Payout & funding wallet:</span> <span className="font-mono">{user.payoutAccountId ?? "not linked"}</span></p>
          <p className="mt-2 text-ink-3">Funding actions require a fresh wallet signature in this session (every 12 hours), so a stolen session cookie alone can't move money.</p>
        </Card>
      </section>
      <section>
        <SectionHeader title="Team" />
        <Card className="divide-y divide-line">
          {members.map((m) => (
            <div key={`${m.name}-${m.role}`} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="flex-1">{m.name} <span className="text-ink-3">{m.email}</span></span>
              <Badge>{m.role}</Badge>
            </div>
          ))}
        </Card>
        <p className="mt-2 text-[12.5px] text-ink-3">Inviting teammates (editor and reviewer roles) is not available in this release yet.</p>
      </section>
    </div>
  );
}
