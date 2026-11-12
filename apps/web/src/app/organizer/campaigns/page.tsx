import Link from "next/link";
import { redirect } from "next/navigation";
import { campaigns, campaignVersions, desc, eq, and } from "@yielvy/db";
import type { CampaignRules } from "@yielvy/core";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/session";
import { myOrganization } from "@/server/spaces";
import { effectiveStatus } from "@/server/campaigns";
import { buttonClass } from "@/components/ui";
import { StatusBadge, formatDate } from "@/components/campaign/bits";
import { GameIcon } from "@/components/host/GameIcon";

export const metadata = { title: "Missions" };

const NEXT: Record<string, string> = {
  DRAFT: "Finish setup →",
  PENDING_FUNDING: "Fund the prize →",
  SCHEDULED: "Starts soon",
  LIVE: "Players are hunting",
  PAUSED: "Paused",
  ENDED: "Ended",
  AWAITING_RESULTS: "Picking winners",
  COMPLETED: "Done",
};

export default async function QuestsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer/campaigns");
  const database = await db();
  const mine = await myOrganization(database, user.userId);
  if (!mine?.space) redirect("/organizer");
  const rows = await database
    .select({ c: campaigns, rules: campaignVersions.rules })
    .from(campaigns)
    .leftJoin(campaignVersions, and(eq(campaignVersions.campaignId, campaigns.id), eq(campaignVersions.version, campaigns.currentVersion)))
    .where(eq(campaigns.spaceId, mine.space.id))
    .orderBy(desc(campaigns.createdAt));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-orange-ink">Missions</p>
          <h1 className="mt-1 text-[30px] font-bold tracking-[-0.02em]">Your missions</h1>
        </div>
        <Link href="/organizer/campaigns/new" className={buttonClass("primary", "md", "yv-glow")}>
          + New mission
        </Link>
      </div>

      {rows.length === 0 ? (
        <Link href="/organizer/campaigns/new" className="card-reward yv-pop flex flex-col items-center rounded-[22px] p-10 text-center">
          <GameIcon name="host" size={150} className="yv-float" />
          <p className="mt-3 text-[22px] font-bold">Create your first mission</p>
          <p className="mt-1 text-ink-2">A few secrets about your project and a prize. That&apos;s it.</p>
        </Link>
      ) : (
        <ul className="yv-stagger grid gap-4 sm:grid-cols-2">
          {rows.map(({ c, rules }) => {
            const st = effectiveStatus(c as never);
            const hunt = c.template === "treasure_hunt";
            const funded = ((rules as CampaignRules | null)?.fundingSource ?? (c.draftRules as CampaignRules | null)?.fundingSource ?? "none") !== "none";
            return (
              <li key={c.id}>
                <Link href={`/organizer/campaigns/${c.id}`} className="group flex h-full gap-4 rounded-[18px] border border-line bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-line-strong">
                  <span className="grid size-20 shrink-0 place-items-center rounded-[14px] bg-paper">{hunt ? <GameIcon name="host" size={68} /> : <GameIcon name="play" size={64} />}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2">
                      <StatusBadge status={st} />
                      {funded && <span className="rounded-full bg-gold-wash px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-gold-ink">Prize</span>}
                    </span>
                    <span className="mt-1.5 truncate font-display text-[17px] font-semibold">{c.title}</span>
                    <span className="text-[12.5px] text-ink-3">{c.startsAt ? `${formatDate(c.startsAt)} – ${formatDate(c.endsAt)}` : hunt ? "Mission" : "Creative Challenge"}</span>
                    <span className="mt-auto pt-2 text-[13px] font-semibold text-orange-ink">{NEXT[st] ?? ""}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
