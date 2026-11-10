import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { StatusBadge, formatDate } from "@/components/campaign/bits";
import { ReportButton } from "@/components/campaign/ReportButton";
import { Lightbulb, TreasureChest } from "@/components/art/Art";
import { IconTrophy } from "@/components/explore/icons";
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
  return { title: d?.campaign.title ?? "Quest" };
}

const STEPS_HUNT = [
  ["1", "Solve the clues", "Answer each question to move along the trail."],
  ["2", "Stuck? Unlock a hint", "Do a quick activity to reveal a clue."],
  ["3", "Win the prize", "Finish the trail to qualify."],
] as const;
const STEPS_CONTEST = [
  ["1", "Read the brief", "See what the vault is looking for."],
  ["2", "Submit your idea", "One entry per explorer."],
  ["3", "Win the prize", "The team picks the winners."],
] as const;

export default async function QuestPage({ params }: { params: Promise<{ slug: string; campaign: string }> }) {
  const p = await params;
  const d = await getPublicCampaign(p.slug, p.campaign);
  if (!d) notFound();
  const { campaign: c, space, rules, participants, status, prize } = d;
  const user = await getSessionUser();
  const t = token();
  await trackView("campaign_view", space.id, c.id);
  const hunt = c.template === "treasure_hunt";
  const funded = rules.fundingSource !== "none";
  const steps = hunt ? STEPS_HUNT : STEPS_CONTEST;
  const returnTo = `/s/${space.slug}/c/${c.slug}`;

  return (
    <>
      <SiteHeader />
      <main className="bg-hero-glow min-h-[calc(100dvh-60px)]">
        <div className="mx-auto max-w-5xl px-4 pb-16 pt-6">
          <nav aria-label="Breadcrumb" className="text-[13px] text-ink-3">
            <Link href="/explore" className="hover:text-ink">Map</Link> <span aria-hidden>/</span>{" "}
            <Link href={`/s/${space.slug}`} className="hover:text-ink">{space.name}</Link>
          </nav>

          {/* hero: the quest and its prize */}
          <section className="mt-5 grid items-center gap-6 md:grid-cols-[1fr_340px]">
            <div className="yv-enter">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={status} />
                <span className={`text-[12px] font-bold uppercase tracking-[0.14em] ${hunt ? "text-sky" : "text-violet-ink"}`}>{hunt ? "Treasure Hunt" : "Creative Challenge"}</span>
              </div>
              <h1 className="mt-3 text-[34px] font-bold leading-[1.05] tracking-[-0.03em] md:text-[46px]">{c.title}</h1>
              {c.summary && <p className="mt-3 max-w-xl text-[17px] text-ink-2">{c.summary}</p>}
              <p className="mt-4 text-[13px] text-ink-3">
                By <Link href={`/s/${space.slug}`} className="font-semibold text-ink-2 hover:text-ink">{space.name}</Link> · {participants} explorer{participants === 1 ? "" : "s"} · ends {formatDate(c.endsAt)}
              </p>
            </div>

            <div className={`yv-pop relative overflow-hidden rounded-[22px] p-5 ${funded ? "card-reward yv-glow" : "border border-line bg-card"}`}>
              <div className="pointer-events-none absolute -right-6 -top-4 opacity-95">
                {hunt ? <TreasureChest size={150} className="yv-float" /> : <Lightbulb size={130} className="yv-float" />}
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-ink">{funded ? "Prize pool" : "Prize"}</p>
              {funded ? (
                <>
                  <p className="mt-2 font-display text-[40px] font-bold leading-none text-reward">{prize ? prize.amount : "Token"}</p>
                  <p className="mt-1 font-display text-[16px] font-semibold text-gold-ink">{prize ? prize.symbol : "prize"}</p>
                  <p className="mt-4 flex items-center gap-1.5 text-[13px] text-ink-2">
                    <IconTrophy size={15} className="text-gold" />
                    {rules.reward.winnersCount} winner{rules.reward.winnersCount === 1 ? "" : "s"}
                    {rules.reward.mode === "equal" ? " share it equally" : ""}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-3">Paid in {t.symbol} to your verified NEAR wallet.</p>
                </>
              ) : (
                <>
                  <p className="mt-2 font-display text-[28px] font-bold leading-tight">Glory</p>
                  <p className="mt-1 max-w-[60%] text-[13px] text-ink-3">This one is just for fun — no token prize.</p>
                </>
              )}
            </div>
          </section>

          {/* how it works, in three beats */}
          <ol className="yv-stagger mt-8 grid gap-2 sm:grid-cols-3">
            {steps.map(([n, title, body]) => (
              <li key={n} className="flex items-start gap-3 rounded-[14px] border border-line bg-[#0e131bcc] px-4 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-orange-wash font-display text-[14px] font-bold text-orange">{n}</span>
                <span>
                  <span className="block text-[14px] font-semibold">{title}</span>
                  <span className="block text-[12.5px] text-ink-3">{body}</span>
                </span>
              </li>
            ))}
          </ol>

          <section className="mt-8" id="play">
            {hunt ? (
              <HuntPlayer campaignId={c.id} status={status} signedIn={Boolean(user)} returnTo={returnTo} />
            ) : (
              <ContestEntry campaignId={c.id} status={status} signedIn={Boolean(user)} returnTo={returnTo} />
            )}
          </section>

          {!hunt && rules.judgingCriteria && (
            <section className="mt-6 flex flex-wrap gap-2">
              {rules.judgingCriteria.map((k) => (
                <span key={k.key} className="rounded-full border border-line bg-card px-3 py-1.5 text-[13px]">
                  {k.label} <span className="text-ink-3">· {k.weightBps / 100}%</span>
                </span>
              ))}
            </section>
          )}

          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {c.description && (
              <details className="rounded-[14px] border border-line bg-card px-4 py-3">
                <summary className="cursor-pointer text-[14px] font-semibold">The story</summary>
                <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-2">{c.description}</p>
              </details>
            )}
            <details className="rounded-[14px] border border-line bg-card px-4 py-3">
              <summary className="cursor-pointer text-[14px] font-semibold">Rules</summary>
              <ul className="mt-2 space-y-1.5 text-[13px] text-ink-2">
                <li>• Free to play. No purchase needed.</li>
                <li>• One entry per person.</li>
                {funded && <li>• Winners are chosen by the published rules after the quest ends; prizes are claimable for {rules.claimWindowDays} days.</li>}
                {funded && <li>• A verified NEAR wallet is needed to receive a prize.</li>}
                <li>• Answers are checked on our servers; bots are disqualified.</li>
              </ul>
              <div className="mt-3">
                <ReportButton targetType="campaign" targetId={c.id} />
              </div>
            </details>
          </div>
        </div>
      </main>
    </>
  );
}
