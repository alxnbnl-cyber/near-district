import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { myOrganization } from "@/server/spaces";
import { OwnerNav } from "./OwnerNav";

export const dynamic = "force-dynamic";

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer");
  const mine = await myOrganization(await db(), user.userId);
  return (
    <>
      <SiteHeader />
      <div className="bg-hero-glow min-h-[calc(100dvh-60px)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[210px_1fr]">
          <aside>
            {mine?.space ? (
              <>
                <div className="mb-4 flex items-center gap-2.5">
                  <span className="grid size-10 place-items-center rounded-[12px] border border-line-strong bg-card font-display text-lg font-bold text-orange">
                    {(mine.space.name.match(/[A-Za-z0-9]/)?.[0] ?? "Y").toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-display font-semibold">{mine.space.name}</span>
                    <span className="block text-[11.5px] text-ink-3">{mine.space.moderation === "approved" ? "Live on the map" : "Waiting for approval"}</span>
                  </span>
                </div>
                <OwnerNav />
              </>
            ) : (
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-3">Host a mission</p>
            )}
          </aside>
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </>
  );
}
