import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { Card } from "@/components/ui";
import { RewardExplainer, StatusBadge, TEMPLATE_LABEL, formatDate } from "@/components/campaign/bits";
import { ReportButton } from "@/components/campaign/ReportButton";
import { getPublicCampaign } from "@/server/public";
import { getSessionUser } from "@/server/session";
import { token } from "@/server/near";
import { trackView } from "@/server/analytics";
import { HuntPlayer } from "./HuntPlayer";
import { ContestEntry } from "./ContestEntry";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; campaign: string }> }) {
  const p = await params;
  const d = await getPublicCampaign(p.slug, p.campaign);
  return { title: d?.campaign.title ?? "Campaign" };
}

export default async function CampaignPage({ params }: { params: Promise<{ slug: string; campaign: string }> }) {
  const p = await params;
  const d = await getPublicCampaign(p.slug, p.campaign);
  if (!d) notFound();
  const { campaign: c, space, rules, participants, status } = d;
  const user = await getSessionUser();
  const t = token();
  await trackView("campaign_view", space.id, c.id);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <nav aria-label="Breadcrumb" className="text-[13px] text-ink-3">
          <Link href="/" className="hover:text-ink">Map</Link> <span aria-hidden>/</span>{" "}
          <Link href={`/s/${space.slug}`} className="hover:text-ink">{space.name}</Link>
        </nav>
        <div className="mt-4 grid gap-8 md:grid-cols-[1fr_320px]">
          <article className="min-w-0">
            {c.coverUploadId && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/uploads/${c.coverUploadId}`} alt="" className="mb-6 aspect-[2/1] w-full rounded-xl border border-line object-cover" />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={status} />
              <span className="text-[13px] font-medium text-ink-3">{TEMPLATE_LABEL[c.template]} · by {space.name}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold leading-tight md:text-4xl">{c.title}</h1>
            {c.summary && <p className="mt-3 text-lg text-ink-2">{c.summary}</p>}
            <div className="mt-6 whitespace-pre-line text-[15px] leading-relaxed">{c.description}</div>

            {c.template === "creative_contest" && rules.judgingCriteria && (
              <section className="mt-8">
                <h2 className="text-lg font-semibold">How entries are judged</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-3">
                  {rules.judgingCriteria.map((k) => (
                    <li key={k.key} className="rounded-lg border border-line bg-card px-4 py-3">
                      <p className="font-semibold">{k.label}</p>
                      <p className="text-[13px] text-ink-3">{k.weightBps / 100}% of the score</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-8" id="play">
              {c.template === "treasure_hunt" ? (
                <HuntPlayer campaignId={c.id} status={status} signedIn={Boolean(user)} returnTo={`/s/${space.slug}/c/${c.slug}`} />
              ) : (
                <ContestEntry campaignId={c.id} status={status} signedIn={Boolean(user)} returnTo={`/s/${space.slug}/c/${c.slug}`} />
              )}
            </section>
          </article>

          <aside className="space-y-4">
            <Card className="p-5">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-[12px] text-ink-3">Starts</dt>
                  <dd className="font-medium">{formatDate(c.startsAt)}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-ink-3">Ends</dt>
                  <dd className="font-medium">{formatDate(c.endsAt)}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-ink-3">Participants</dt>
                  <dd className="font-display text-lg font-semibold tabular">{participants}</dd>
                </div>
                {rules.questionCount ? (
                  <div>
                    <dt className="text-[12px] text-ink-3">Questions</dt>
                    <dd className="font-display text-lg font-semibold tabular">{rules.questionCount}</dd>
                  </div>
                ) : null}
              </dl>
            </Card>
            <RewardExplainer rules={rules} decimals={t.decimals} symbol={t.symbol} />
            <Card className="p-5 text-[13px] text-ink-2">
              <p className="font-semibold text-ink">Rules</p>
              <ul className="mt-2 space-y-1.5">
                <li>• Free to take part. No purchase is ever required.</li>
                <li>• One entry per person. Multiple accounts are disqualified.</li>
                {rules.fundingSource !== "none" && rules.eligibility.requireVerifiedPayout && <li>• A verified NEAR wallet is required to receive rewards.</li>}
                {rules.eligibility.maxParticipants && <li>• Limited to {rules.eligibility.maxParticipants} participants.</li>}
                <li>• Answers are checked by our servers; automated play is blocked and may lead to disqualification.</li>
                <li>• Rules version {c.currentVersion}. Material changes are not allowed after people join.</li>
              </ul>
              <div className="mt-3">
                <ReportButton targetType="campaign" targetId={c.id} />
              </div>
            </Card>
          </aside>
        </div>
      </main>
    </>
  );
}
