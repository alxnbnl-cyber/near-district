import Link from "next/link";
import { redirect } from "next/navigation";
import { campaigns, desc, eq } from "@yielvy/db";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/session";
import { myOrganization } from "@/server/spaces";
import { effectiveStatus } from "@/server/campaigns";
import { Card, EmptyState, SectionHeader, buttonClass } from "@/components/ui";
import { StatusBadge, TEMPLATE_LABEL, formatDate } from "@/components/campaign/bits";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer/campaigns");
  const database = await db();
  const mine = await myOrganization(database, user.userId);
  if (!mine?.space) redirect("/organizer");
  const rows = await database.select().from(campaigns).where(eq(campaigns.spaceId, mine.space.id)).orderBy(desc(campaigns.createdAt));
  return (
    <div>
      <SectionHeader
        eyebrow="Campaigns"
        title="Your experiences"
        action={
          <Link href="/organizer/campaigns/new" className={buttonClass("primary")}>
            Create campaign
          </Link>
        }
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState title="No campaigns yet" action={<Link href="/organizer/campaigns/new" className={buttonClass("primary")}>Create your first</Link>}>
            Start with a treasure hunt through your docs, or ask your community for ideas.
          </EmptyState>
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {rows.map((c) => (
            <Link key={c.id} href={`/organizer/campaigns/${c.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-paper">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.title}</p>
                <p className="text-[12.5px] text-ink-3">
                  {TEMPLATE_LABEL[c.template]} · {c.startsAt ? `${formatDate(c.startsAt)} – ${formatDate(c.endsAt)}` : "Not scheduled"}
                </p>
              </div>
              <StatusBadge status={effectiveStatus(c as never)} />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
