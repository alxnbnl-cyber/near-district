import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { Card, EmptyState, buttonClass } from "@/components/ui";
import { StatusBadge, TEMPLATE_LABEL, formatDate } from "@/components/campaign/bits";
import { districtName } from "@/components/world/shared";
import { getPublicSpace } from "@/server/public";
import { ReportButton } from "@/components/campaign/ReportButton";
import { trackView } from "@/server/analytics";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const s = await getPublicSpace((await params).slug);
  return { title: s?.space.name ?? "Project" };
}

export default async function SpacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicSpace(slug);
  if (!data) notFound();
  const { space, building, active, upcoming, past } = data;
  await trackView("space_view", space.id, null);
  const socials = Object.entries(space.socials ?? {});
  return (
    <>
      <SiteHeader />
      <main>
        <div className="relative h-48 overflow-hidden border-b border-line bg-paper-2 paper-grain md:h-60">
          {space.bannerUploadId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/uploads/${space.bannerUploadId}`} alt="" className="absolute inset-0 size-full object-cover" />
          )}
        </div>
        <div className="mx-auto max-w-5xl px-4">
          <div className="-mt-12 flex flex-wrap items-end gap-4">
            <div className="grid size-24 place-items-center overflow-hidden rounded-[22px] border-4 border-paper bg-card shadow-pop">
              {space.logoUploadId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/uploads/${space.logoUploadId}`} alt={`${space.name} logo`} className="size-full object-cover" />
              ) : (
                <span className="font-display text-4xl font-bold text-orange-ink">{space.name.slice(0, 1)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">{building ? districtName(building.districtId) : ""}</p>
              <h1 className="text-3xl font-semibold">{space.name}</h1>
            </div>
            <div className="flex gap-2 pb-1">
              <Link href="/explore" className={buttonClass("secondary", "sm")}>
                Back to the map
              </Link>
              <ReportButton targetType="space" targetId={space.id} />
            </div>
          </div>

          <div className="mt-6 grid gap-8 pb-16 md:grid-cols-[1fr_260px]">
            <div className="min-w-0">
              {space.tagline && <p className="text-lg text-ink-2">{space.tagline}</p>}
              {space.description && <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-ink">{space.description}</p>}

              <div id="experiences" className="scroll-mt-24" />
              <CampaignList title="Missions" items={active} slug={slug} empty="Nothing is running right now." />
              <CampaignList title="Coming up" items={upcoming} slug={slug} empty="No upcoming missions yet." />
              {past.length > 0 && <CampaignList title="Previously" items={past} slug={slug} empty="" />}
            </div>
            <aside className="space-y-3">
              <Card className="p-4 text-sm">
                <p className="font-semibold">Links</p>
                <ul className="mt-2 space-y-1.5">
                  {space.websiteUrl && (
                    <li>
                      <a href={space.websiteUrl} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-orange-ink hover:underline">
                        Website ↗
                      </a>
                    </li>
                  )}
                  {socials.map(([k, v]) => (
                    <li key={k}>
                      <a href={v} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-orange-ink hover:underline">
                        {k[0]!.toUpperCase() + k.slice(1)} ↗
                      </a>
                    </li>
                  ))}
                  {!space.websiteUrl && socials.length === 0 && <li className="text-ink-3">No links shared.</li>}
                </ul>
                <p className="mt-3 text-[12px] text-ink-3">External links are provided by the organizer. NEAR District doesn't vouch for them.</p>
              </Card>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}

function CampaignList({
  title,
  items,
  slug,
  empty,
}: {
  title: string;
  items: { id: string; slug: string; title: string; summary: string; template: string; effective: string; startsAt: Date | null; endsAt: Date | null }[];
  slug: string;
  empty: string;
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {items.length === 0 ? (
        <Card className="p-0">
          <EmptyState title={empty} />
        </Card>
      ) : (
        <ul className="grid gap-3">
          {items.map((c) => (
            <li key={c.id}>
              <Link href={`/s/${slug}/c/${c.slug}`} className="block rounded-lg border border-line bg-card p-4 shadow-lift transition-colors hover:border-line-strong">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={c.effective as never} />
                  <span className="text-[12px] font-medium text-ink-3">{TEMPLATE_LABEL[c.template]}</span>
                </div>
                <p className="mt-2 font-display text-lg font-semibold">{c.title}</p>
                {c.summary && <p className="mt-0.5 text-sm text-ink-2">{c.summary}</p>}
                <p className="mt-2 text-[12.5px] text-ink-3">
                  {formatDate(c.startsAt)} – {formatDate(c.endsAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
