import Link from "next/link";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { Card, EmptyState, buttonClass } from "@/components/ui";
import { StatusBadge, TEMPLATE_LABEL, formatDate } from "@/components/campaign/bits";
import { listLiveExperiences } from "@/server/public";

export const dynamic = "force-dynamic";
export const metadata = { title: "Experiences" };

export default async function ExperiencesPage() {
  const rows = await listLiveExperiences();
  const live = rows.filter((r) => r.status === "LIVE");
  const soon = rows.filter((r) => r.status === "SCHEDULED");
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-semibold">Experiences</h1>
        <p className="mt-1 text-ink-2">Every hunt and contest open in town right now, without the map.</p>
        {[
          ["Happening now", live],
          ["Starting soon", soon],
        ].map(([title, list]) => (
          <section key={title as string} className="mt-10">
            <h2 className="mb-3 text-lg font-semibold">{title as string}</h2>
            {(list as typeof rows).length === 0 ? (
              <Card>
                <EmptyState title="Nothing here yet" action={<Link href="/" className={buttonClass("secondary", "sm")}>Wander the map</Link>}>
                  New experiences appear as Spaces open them.
                </EmptyState>
              </Card>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {(list as typeof rows).map(({ c, space, status }) => (
                  <li key={c.id}>
                    <Link href={`/s/${space.slug}/c/${c.slug}`} className="block h-full rounded-lg border border-line bg-card p-4 shadow-lift hover:border-line-strong">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={status} />
                        <span className="text-[12px] text-ink-3">{TEMPLATE_LABEL[c.template]} · {space.name}</span>
                      </div>
                      <p className="mt-2 font-display text-lg font-semibold">{c.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{c.summary}</p>
                      <p className="mt-2 text-[12.5px] text-ink-3">Ends {formatDate(c.endsAt)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </main>
    </>
  );
}
