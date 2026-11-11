import { redirect } from "next/navigation";
import { UserMenu } from "@/components/shell/UserMenu";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { myOrganization } from "@/server/spaces";
import { demoEnabled } from "@/server/demo";
import { frame } from "@/components/explore/frame";
import { BackLink, DemoApprove, OwnerNav, SectionGate } from "./HostChrome";

export const dynamic = "force-dynamic";

const INK = "rgb(214 219 225";

/** Host console: the game's dark HUD look, a back link instead of the site nav, guide-ordered sidebar. */
export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer");
  const mine = await myOrganization(await db(), user.userId);
  const space = mine?.space ?? null;
  const approved = Boolean(space && space.moderation === "approved" && mine?.org.status === "approved");
  const pending = Boolean(space && space.moderation === "pending");

  return (
    <div className="relative min-h-dvh bg-[#05070a] text-ink">
      {/* faint grid, like the map HUD */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          backgroundImage: "linear-gradient(rgb(214 219 225 / .035) 1px, transparent 1px), linear-gradient(90deg, rgb(214 219 225 / .035) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgb(255_145_56/.07),transparent_60%)]" />

      <header className="sticky top-0 z-40 border-b border-[rgb(255_255_255/.06)] bg-[rgb(5_7_10/.8)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <BackLink />
          <span className="hidden font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[rgb(214_219_225/.45)] sm:block">Host console</span>
          <div className="ml-auto">
            <UserMenu dark user={{ displayName: user.displayName, isAdmin: user.adminRoles.length > 0 }} />
          </div>
        </div>
      </header>

      <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[230px_1fr]">
        <aside className="md:sticky md:top-24 md:self-start">
          <div className="mb-5 flex items-center gap-3 bg-[rgb(10_13_18/.7)] p-3 font-mono" style={frame(10, `${INK} / .14)`)}>
            <span className="grid size-11 shrink-0 place-items-center bg-[rgb(255_255_255/.05)] font-display text-[20px] font-bold text-orange shadow-[inset_0_0_0_1px_rgb(255_255_255/.12)]">
              {((space?.name ?? "?").match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold uppercase tracking-[0.08em] text-white">{space?.name ?? "New company"}</span>
              <span className={`mt-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] ${approved ? "text-mint-ink" : pending ? "text-gold" : "text-[rgb(214_219_225/.45)]"}`}>
                <span className={`size-1.5 rounded-full ${approved ? "bg-mint-ink" : pending ? "animate-pulse bg-gold" : "bg-[rgb(214_219_225/.35)]"}`} />
                {approved ? "Approved" : pending ? "In review" : "Not set up"}
              </span>
            </span>
          </div>
          <OwnerNav hasSpace={Boolean(space)} approved={approved} />
        </aside>
        <main className="min-w-0">
          <SectionGate approved={approved} hasSpace={Boolean(space)}>
            {children}
          </SectionGate>
        </main>
      </div>

      <DemoApprove pending={pending} demo={demoEnabled()} />
    </div>
  );
}
