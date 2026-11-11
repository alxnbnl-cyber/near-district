import { redirect } from "next/navigation";
import { analyticsEvents, and, campaigns, count, creativeSubmissions, desc, eq, inArray, participantEntries, qualifications, rewardAllocations, rewardClaims, rewardPeriods } from "@yielvy/db";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { myOrganization } from "@/server/spaces";
import { Card, EmptyState, SectionHeader } from "@/components/ui";

export const metadata = { title: "Participants" };

export default async function ParticipantsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer/participants");
  const database = await db();
  const mine = await myOrganization(database, user.userId);
  if (!mine?.space) redirect("/organizer");
  const camps = await database.select().from(campaigns).where(eq(campaigns.spaceId, mine.space.id)).orderBy(desc(campaigns.createdAt));
  const rows = await Promise.all(
    camps
      .filter((c) => c.status !== "DRAFT")
      .map(async (c) => {
        const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
        const views = await n(database.select({ n: count() }).from(analyticsEvents).where(and(eq(analyticsEvents.campaignId, c.id), eq(analyticsEvents.kind, "campaign_view"))));
        const starts = await n(database.select({ n: count() }).from(participantEntries).where(eq(participantEntries.campaignId, c.id)));
        const completes = await n(database.select({ n: count() }).from(participantEntries).where(and(eq(participantEntries.campaignId, c.id), eq(participantEntries.status, "completed"))));
        const qualified = await n(database.select({ n: count() }).from(qualifications).where(and(eq(qualifications.campaignId, c.id), eq(qualifications.status, "qualified"))));
        const subs = await n(database.select({ n: count() }).from(creativeSubmissions).where(eq(creativeSubmissions.campaignId, c.id)));
        const periods = await database.select({ id: rewardPeriods.id }).from(rewardPeriods).where(eq(rewardPeriods.campaignId, c.id));
        const winners = periods.length ? await n(database.select({ n: count() }).from(rewardAllocations).where(inArray(rewardAllocations.rewardPeriodId, periods.map((p) => p.id)))) : 0;
        const claims = periods.length
          ? await n(
              database
                .select({ n: count() })
                .from(rewardClaims)
                .innerJoin(rewardAllocations, eq(rewardAllocations.id, rewardClaims.allocationId))
                .where(and(inArray(rewardAllocations.rewardPeriodId, periods.map((p) => p.id)), eq(rewardClaims.state, "CONFIRMED"))),
            )
          : 0;
        return { c, views, starts, completes, qualified, subs, winners, claims };
      }),
  );
  return (
    <div>
      <SectionHeader eyebrow="Participants" title="Who showed up" />
      {rows.length === 0 ? (
        <Card><EmptyState title="No live missions yet" /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[12.5px] text-ink-3">
              <tr>
                {["Mission", "Views", "Started", "Completed", "Completion", "Qualified", "Entries", "Winners", "Claimed"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular">
              {rows.map((r) => (
                <tr key={r.c.id}>
                  <td className="px-4 py-3 font-semibold">{r.c.title}</td>
                  <td className="px-4 py-3">{r.views}</td>
                  <td className="px-4 py-3">{r.starts}</td>
                  <td className="px-4 py-3">{r.completes}</td>
                  <td className="px-4 py-3">{r.starts ? `${Math.round((r.completes / r.starts) * 100)}%` : "—"}</td>
                  <td className="px-4 py-3">{r.qualified}</td>
                  <td className="px-4 py-3">{r.subs}</td>
                  <td className="px-4 py-3">{r.winners}</td>
                  <td className="px-4 py-3">{r.claims}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="mt-2 text-[12.5px] text-ink-3">All figures come from NEAR District's records; payouts are additionally verifiable on-chain.</p>
    </div>
  );
}
