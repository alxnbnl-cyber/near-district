import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { Badge, Card, buttonClass } from "@/components/ui";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/session";
import { publicExpeditions } from "@/server/expeditions";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const user = await getSessionUser();
  const all = await publicExpeditions(await db(), user?.userId ?? null);
  return { route: all.find((r) => r.slug === slug) ?? null, signedIn: Boolean(user) };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { route } = await load((await params).slug);
  return { title: route?.title ?? "Expedition" };
}

export default async function ExpeditionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { route, signedIn } = await load(slug);
  if (!route) notFound();
  const done = route.chapters.filter((c) => c.completed).length;
  const spaces = [...new Map(route.chapters.map((c) => [c.spaceId, c.spaceName])).values()];
  const reward = route.chapters.find((c) => c.reward);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <nav aria-label="Breadcrumb" className="text-[13px] text-ink-3">
          <Link href="/explore" className="hover:text-ink">Map</Link> <span aria-hidden>/</span> Expedition
        </nav>
        <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.16em] text-sky">Shared expedition · {spaces.join(" × ")}</p>
        <h1 className="mt-2 text-3xl font-semibold md:text-4xl">{route.title}</h1>
        {route.summary && <p className="mt-3 text-lg text-ink-2">{route.summary}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={`/explore?expedition=${route.slug}`} className={buttonClass("primary", "md")}>
            Show the route on the map
          </Link>
        </div>

        <Card className="mt-8 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Chapters</h2>
            {signedIn ? (
              <span className="text-[13px] text-ink-3">{route.completedAt ? "You completed this expedition" : `${done} of ${route.chapters.length} complete`}</span>
            ) : (
              <Link href={`/signin?next=/x/${route.slug}`} className="text-[13px] font-semibold text-orange-ink hover:underline">Sign in to track progress</Link>
            )}
          </div>
          <ol className="mt-4 flex flex-col gap-2">
            {route.chapters.map((c, i) => (
              <li key={c.campaignId} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-paper px-4 py-3">
                <span className={`grid size-9 place-items-center rounded-full font-display text-sm font-bold ${c.completed ? "bg-orange text-[#140c05]" : c.unlocked ? "border-2 border-sky text-sky" : "border border-line-strong text-ink-3"}`}>
                  {c.completed ? "✓" : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {c.title} {c.reward && <Badge tone="gold">Reward chapter</Badge>}
                  </p>
                  <p className="text-[12.5px] text-ink-3">
                    {c.spaceName} · {c.template === "treasure_hunt" ? "Treasure Hunt" : "Creative Contest"} · {c.completed ? "Completed" : c.unlocked ? "Open" : "Unlocks after the previous chapter"}
                  </p>
                </div>
                <Link href={`/s/${c.spaceSlug}/c/${c.campaignSlug}`} className={buttonClass(c.unlocked && !c.completed ? "primary" : "dark", "sm")}>
                  {c.completed ? "Review" : "Open"}
                </Link>
              </li>
            ))}
          </ol>
        </Card>

        <section className="mt-6 text-[13.5px] leading-relaxed text-ink-2">
          <h2 className="text-base font-semibold text-ink">How it works</h2>
          <p className="mt-1">
            Each chapter is a campaign run by the Space that hosts it. A chapter counts once you genuinely finish it — solving the hunt or submitting your
            contest entry — and the next chapter opens in the order every organizer approved.
          </p>
          {reward ? (
            <p className="mt-2">
              The final chapter, “{reward.title}”, is open only to explorers who completed every earlier chapter. Whether you win anything there is decided by
              that campaign&apos;s published reward rules — finishing chapters never pays out by itself.
            </p>
          ) : (
            <p className="mt-2">This expedition has no separate prize. Each chapter follows its own campaign&apos;s published rules.</p>
          )}
        </section>
      </main>
    </>
  );
}
