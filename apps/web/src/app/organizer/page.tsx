import Link from "next/link";
import { redirect } from "next/navigation";
import { and, campaigns, count, eq, inArray, participantEntries, qualifications } from "@near-district/db";
import type { CampaignRules } from "@near-district/core";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { myOrganization } from "@/server/spaces";
import { frame } from "@/components/explore/frame";
import { GameIcon, type GameIconName } from "@/components/host/GameIcon";
import { Onboarding } from "./Onboarding";

export const metadata = { title: "Host console" };

const INK = "rgb(214 219 225";

interface Step {
  icon: GameIconName;
  title: string;
  body: string;
  done: boolean;
  /** Waiting on us (review), not on the owner. */
  waiting?: boolean;
  optional?: boolean;
  locked?: boolean;
  action?: { href: string; label: string };
  /** Shown instead of a generic "View" once the step is done. */
  doneAction?: { href: string; label: string };
}

export default async function OwnerHome() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer");
  const database = await db();
  const mine = await myOrganization(database, user.userId);
  if (!mine?.space) return <Onboarding hasWallet={Boolean(user.payoutAccountId)} walletAccount={user.payoutAccountId} />;

  const s = mine.space;
  const camps = await database
    .select({ id: campaigns.id, status: campaigns.status, vaultId: campaigns.vaultCampaignId, rules: campaigns.draftRules })
    .from(campaigns)
    .where(eq(campaigns.spaceId, s.id));
  const ids = camps.map((c) => c.id);
  const [{ n: players } = { n: 0 }] = ids.length ? await database.select({ n: count() }).from(participantEntries).where(inArray(participantEntries.campaignId, ids)) : [{ n: 0 }];
  const [{ n: finishers } = { n: 0 }] = ids.length
    ? await database.select({ n: count() }).from(qualifications).where(and(inArray(qualifications.campaignId, ids), eq(qualifications.status, "qualified")))
    : [{ n: 0 }];
  const onMap = camps.filter((c) => c.status === "LIVE" || c.status === "SCHEDULED").length;

  const approved = s.moderation === "approved" && mine.org.status === "approved";
  const funded = camps.some((c) => c.vaultId !== null || ((c.rules as CampaignRules | null)?.fundingSource ?? "none") !== "none");
  const locked = !approved;

  const steps: Step[] = [
    { icon: "company", title: "Company profile", body: "Shown on your map pin", done: true, action: { href: "/organizer/space", label: "Edit profile" } },
    {
      icon: "approval",
      title: "Get approved",
      body: approved ? "You're on the map" : "Usually takes a moment",
      done: approved,
      waiting: !approved,
    },
    { icon: "host", title: "Create a mission", body: "Secrets, prize and dates", done: camps.length > 0, locked, action: { href: "/organizer/campaigns/new", label: "Create mission" } },
    { icon: "earn", title: "Fund the reward", body: "Locked in the vault for players", done: funded, locked, action: { href: "/organizer/funding", label: "Fund reward" } },
    { icon: "explore", title: "Go live", body: "Your pin lights up", done: onMap > 0, locked, action: { href: "/organizer/campaigns", label: "Publish" }, doneAction: { href: `/explore?space=${encodeURIComponent(s.slug)}`, label: "View on map" } },
  ];
  const current = steps.findIndex((x) => !x.done && !x.optional);
  const doneCount = steps.filter((x) => x.done).length;
  const required = steps.filter((x) => !x.optional).length;

  return (
    <div className="flex flex-col gap-8 font-mono">
      <section>
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-orange">Overview</p>
        <h1 className="mt-1 font-display text-[32px] font-bold uppercase leading-tight tracking-[0.02em] text-white">
          {current === -1 ? "You're live" : `Next: ${steps[current]!.title}`}
        </h1>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden bg-[rgb(214_219_225/.1)]">
            <div className="h-full bg-orange transition-[width] duration-700" style={{ width: `${(Math.min(doneCount, required) / required) * 100}%` }} />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.55)]">
            {Math.min(doneCount, required)} / {required}
          </span>
        </div>
      </section>

      <ol className="flex flex-col gap-2.5">
        {steps.map((st, i) => {
          const now = i === current;
          const tone = now ? "rgb(255 145 56 / .75)" : st.done ? "rgb(214 219 225 / .16)" : `${INK} / .1)`;
          return (
            <li
              key={st.title}
              className={`flex items-center gap-4 p-4 transition-opacity ${now ? "bg-[linear-gradient(100deg,rgb(255_145_56/.14),rgb(10_13_18/.7)_60%)]" : "bg-[rgb(10_13_18/.6)]"} ${st.locked && !now ? "opacity-45" : ""}`}
              style={frame(12, tone, now ? 1.5 : 1)}
            >
              <span className={`grid size-7 shrink-0 place-items-center text-[11px] font-black ${st.done ? "bg-orange text-[#140c05]" : now ? "border border-orange text-orange" : "border border-[rgb(214_219_225/.25)] text-[rgb(214_219_225/.5)]"}`}>
                {st.done ? "✓" : i + 1}
              </span>
              <GameIcon name={st.icon} size={now ? 60 : 48} className={st.locked ? "grayscale" : ""} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em] text-white">
                  {st.title}
                  {st.optional && <span className="text-[9.5px] tracking-[0.2em] text-[rgb(214_219_225/.45)]">Optional</span>}
                </p>
                {now && <p className="mt-0.5 font-sans text-[13px] text-[rgb(214_219_225/.6)]">{st.body}</p>}
              </div>
              <div className="shrink-0">
                {st.waiting ? (
                  <span className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.2em] text-gold">
                    <span className="size-3 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                    In review
                  </span>
                ) : st.locked ? (
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.4)]">Locked</span>
                ) : st.action ? (
                  <Link
                    href={st.done && !now && st.doneAction ? st.doneAction.href : st.action.href}
                    className={`inline-flex h-10 items-center px-4 text-[11px] font-black uppercase tracking-[0.16em] transition-colors ${now ? "bg-orange text-[#140c05] hover:bg-[#ffa458]" : "text-[rgb(214_219_225/.75)] hover:text-white"}`}
                    style={now ? frame(9, "rgb(255 145 56)") : frame(9, `${INK} / .22)`)}
                  >
                    {st.done && !now ? (st.doneAction?.label ?? (st.icon === "company" ? "Edit" : "View")) : st.action.label}
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <section className="grid grid-cols-3 gap-2.5">
        {(
          [
            ["Missions on map", onMap, "text-orange"],
            ["Players", players, "text-sky"],
            ["Finished", finishers, "text-reward"],
          ] as const
        ).map(([label, value, cls]) => (
          <div key={label} className="bg-[rgb(10_13_18/.6)] p-4" style={frame(10, `${INK} / .12)`)}>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.5)]">{label}</p>
            <p className={`mt-1 font-display text-[30px] font-bold leading-none tabular-nums ${cls}`}>{value}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
