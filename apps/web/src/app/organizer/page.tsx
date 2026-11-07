import Link from "next/link";
import { redirect } from "next/navigation";
import { and, campaigns, count, eq, inArray, participantEntries, qualifications } from "@yielvy/db";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { myOrganization } from "@/server/spaces";
import { Card, Figure, Notice, SectionHeader, buttonClass } from "@/components/ui";
import { Onboarding } from "./Onboarding";
import { OrganizerFinanceSummary } from "./OrganizerFinanceSummary";

export const metadata = { title: "Organizer" };

export default async function OrganizerHome() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer");
  const database = await db();
  const mine = await myOrganization(database, user.userId);

  if (!mine?.space) {
    return <Onboarding hasWallet={Boolean(user.payoutAccountId)} walletAccount={user.payoutAccountId} />;
  }

  const camps = await database.select({ id: campaigns.id, status: campaigns.status }).from(campaigns).where(eq(campaigns.spaceId, mine.space.id));
  const ids = camps.map((c) => c.id);
  const [{ n: participants } = { n: 0 }] = ids.length
    ? await database.select({ n: count() }).from(participantEntries).where(inArray(participantEntries.campaignId, ids))
    : [{ n: 0 }];
  const [{ n: qualified } = { n: 0 }] = ids.length
    ? await database.select({ n: count() }).from(qualifications).where(and(inArray(qualifications.campaignId, ids), eq(qualifications.status, "qualified")))
    : [{ n: 0 }];
  const active = camps.filter((c) => c.status === "LIVE").length;

  return (
    <div className="flex flex-col gap-8">
      {mine.space.moderation === "pending" && (
        <Notice tone="warn" title="Your Space is waiting for review">
          It already has its plot on the map, but stays hidden from explorers until our team approves it. You can prepare campaigns meanwhile.
        </Notice>
      )}
      <section>
        <SectionHeader
          eyebrow="Overview"
          title={mine.space.name}
          action={
            <Link href="/organizer/campaigns/new" className={buttonClass("primary")}>
              Create campaign
            </Link>
          }
        />
        <Card className="grid grid-cols-2 gap-6 p-5 md:grid-cols-3">
          <Figure label="Active campaigns" value={active} kind="record" help="Campaigns currently live." />
          <Figure label="Participants" value={participants} kind="record" help="People who started a campaign." />
          <Figure label="Qualified" value={qualified} kind="record" help="Completed every requirement." />
        </Card>
        <p className="mt-2 text-[12px] text-ink-3">Participation figures come from Yielvy's records. Money figures below come from the chain.</p>
      </section>
      <OrganizerFinanceSummary spaceId={mine.space.id} />
    </div>
  );
}
