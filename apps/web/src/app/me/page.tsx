import Link from "next/link";
import { redirect } from "next/navigation";
import { campaigns, creativeSubmissions, desc, eq, participantEntries, qualifications, spaces, and } from "@yielvy/db";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { Badge, Card, EmptyState, buttonClass } from "@/components/ui";
import { StatusBadge, TEMPLATE_LABEL } from "@/components/campaign/bits";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { effectiveStatus } from "@/server/campaigns";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Adventures" };

export default async function MyAdventures() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/me");
  const database = await db();
  const hunts = await database
    .select({ e: participantEntries, c: campaigns, space: spaces, q: qualifications })
    .from(participantEntries)
    .innerJoin(campaigns, eq(campaigns.id, participantEntries.campaignId))
    .innerJoin(spaces, eq(spaces.id, campaigns.spaceId))
    .leftJoin(qualifications, and(eq(qualifications.campaignId, campaigns.id), eq(qualifications.userId, participantEntries.userId)))
    .where(eq(participantEntries.userId, user.userId))
    .orderBy(desc(participantEntries.startedAt));
  const entries = await database
    .select({ s: creativeSubmissions, c: campaigns, space: spaces })
    .from(creativeSubmissions)
    .innerJoin(campaigns, eq(campaigns.id, creativeSubmissions.campaignId))
    .innerJoin(spaces, eq(spaces.id, campaigns.spaceId))
    .where(eq(creativeSubmissions.userId, user.userId))
    .orderBy(desc(creativeSubmissions.createdAt));

  const qualLabel = (q: (typeof hunts)[number]["q"]) =>
    !q ? null : q.status === "qualified" ? <Badge tone="mint">Qualified</Badge> : q.status === "held" ? <Badge tone="gold">Under review</Badge> : <Badge tone="danger">Not eligible</Badge>;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">My Adventures</h1>
            <p className="mt-1 text-ink-2">Everything you've started, finished or entered.</p>
          </div>
          <Link href="/me/rewards" className={buttonClass("secondary", "sm")}>My Rewards</Link>
        </div>
        {hunts.length === 0 && entries.length === 0 ? (
          <Card className="mt-8">
            <EmptyState title="Your story starts on the map" action={<Link href="/" className={buttonClass("primary")}>Go exploring</Link>}>
              Open a building with a LIVE sign and see what's inside.
            </EmptyState>
          </Card>
        ) : (
          <ul className="mt-8 flex flex-col gap-3">
            {hunts.map(({ e, c, space, q }) => (
              <li key={e.id}>
                <Link href={`/s/${space.slug}/c/${c.slug}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card p-4 shadow-lift hover:border-line-strong">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-ink-3">{TEMPLATE_LABEL[c.template]} · {space.name}</p>
                    <p className="font-semibold">{c.title}</p>
                    <p className="text-[13px] text-ink-2">{e.status === "completed" ? `Finished · ${e.score} pts` : `In progress · question ${e.progress + 1}`}</p>
                  </div>
                  {qualLabel(q)}
                  <StatusBadge status={effectiveStatus(c as never)} />
                </Link>
              </li>
            ))}
            {entries.map(({ s, c, space }) => (
              <li key={s.id}>
                <Link href={`/s/${space.slug}/c/${c.slug}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card p-4 shadow-lift hover:border-line-strong">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-ink-3">Creative Contest · {space.name}</p>
                    <p className="font-semibold">{c.title}</p>
                    <p className="text-[13px] text-ink-2">Your entry: “{s.title}”</p>
                  </div>
                  {s.status === "winner" ? <Badge tone="mint">Winner</Badge> : s.status === "shortlisted" ? <Badge tone="sky">Shortlisted</Badge> : <Badge>Submitted</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
