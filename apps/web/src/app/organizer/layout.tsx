import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { myOrganization } from "@/server/spaces";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

const NAV = [
  ["/organizer", "Overview"],
  ["/organizer/space", "My Space"],
  ["/organizer/campaigns", "Campaigns"],
  ["/organizer/funding", "Funding"],
  ["/organizer/participants", "Participants"],
  ["/organizer/settings", "Settings"],
] as const;

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer");
  const mine = await myOrganization(await db(), user.userId);
  return (
    <>
      <SiteHeader />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[200px_1fr]">
        <aside>
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">Organizer</p>
          {mine?.space ? (
            <div className="mb-4">
              <p className="truncate font-display text-lg font-semibold">{mine.space.name}</p>
              {mine.space.moderation !== "approved" && (
                <Badge tone="gold">{mine.space.moderation === "pending" ? "Awaiting review" : mine.space.moderation}</Badge>
              )}
            </div>
          ) : null}
          {mine?.space && (
            <nav aria-label="Organizer">
              <ul className="flex gap-1 overflow-x-auto md:flex-col">
                {NAV.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} className="block whitespace-nowrap rounded-md px-3 py-2 text-[14px] font-medium text-ink-2 hover:bg-paper-2 hover:text-ink">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </>
  );
}
