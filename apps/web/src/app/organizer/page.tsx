import Link from "next/link";
import { redirect } from "next/navigation";
import { analyticsEvents, and, campaigns, count, eq, inArray, participantEntries, qualifications } from "@yielvy/db";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { myOrganization } from "@/server/spaces";
import { buttonClass } from "@/components/ui";
import { CoinStack, Hourglass, RocketFlag, TreasureMap, VaultDoor } from "@/components/art/Art";
import { Onboarding } from "./Onboarding";
import { HowItWorks } from "./HowItWorks";

export const metadata = { title: "Dashboard" };

export default async function OwnerHome() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer");
  const database = await db();
  const mine = await myOrganization(database, user.userId);
  if (!mine?.space) return <Onboarding hasWallet={Boolean(user.payoutAccountId)} walletAccount={user.payoutAccountId} />;

  const s = mine.space;
  const camps = await database.select({ id: campaigns.id, status: campaigns.status, vaultId: campaigns.vaultCampaignId }).from(campaigns).where(eq(campaigns.spaceId, s.id));
  const ids = camps.map((c) => c.id);
  const [{ n: players } = { n: 0 }] = ids.length ? await database.select({ n: count() }).from(participantEntries).where(inArray(participantEntries.campaignId, ids)) : [{ n: 0 }];
  const [{ n: finishers } = { n: 0 }] = ids.length
    ? await database.select({ n: count() }).from(qualifications).where(and(inArray(qualifications.campaignId, ids), eq(qualifications.status, "qualified")))
    : [{ n: 0 }];
  const [{ n: visitors } = { n: 0 }] = await database.select({ n: count() }).from(analyticsEvents).where(and(eq(analyticsEvents.spaceId, s.id), eq(analyticsEvents.kind, "space_view")));
  const live = camps.filter((c) => c.status === "LIVE" || c.status === "SCHEDULED").length;
  const vaultDeployed = Boolean(env().VAULT_CONTRACT_ID);

  const approved = s.moderation === "approved";
  const steps = [
    { title: "Create your project", body: "Your place on the map.", done: true, art: VaultDoor },
    { title: "Get approved", body: approved ? "You're on the map." : s.moderation === "pending" ? "Our team is reviewing it." : "Contact support.", done: approved, art: Hourglass },
    { title: "Create a mission", body: "A mission or challenge.", done: camps.length > 0, art: TreasureMap, href: "/organizer/campaigns/new", cta: "Create mission" },
    { title: "Fund the prize", body: vaultDeployed ? "Deposit the reward." : "Opens when funding launches.", done: camps.some((c) => c.vaultId !== null), art: CoinStack, href: "/organizer/funding", cta: "Fund prize" },
    { title: "Go live", body: "Explorers start playing.", done: live > 0, art: RocketFlag, href: "/organizer/campaigns", cta: "Publish" },
  ];
  const current = steps.findIndex((x) => !x.done);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-orange-ink">Your road to launch</p>
        <h1 className="mt-1 text-[30px] font-bold tracking-[-0.02em]">{current === -1 ? "You're live 🎉" : `Next: ${steps[current]!.title.toLowerCase()}`}</h1>
        <ol className="yv-stagger mt-5 grid gap-3 sm:grid-cols-5">
          {steps.map((st, i) => {
            const now = i === current;
            const Art = st.art;
            return (
              <li
                key={st.title}
                className={`relative flex flex-col items-center rounded-[18px] border p-4 text-center transition-transform ${
                  now ? "card-reward yv-glow -translate-y-1" : st.done ? "border-orange/40 bg-card" : "border-line bg-card/60 opacity-70"
                }`}
              >
                <span className={`absolute left-3 top-3 grid size-6 place-items-center rounded-full text-[11px] font-bold ${st.done ? "bg-orange text-[#140c05]" : "bg-paper-2 text-ink-3"}`}>{st.done ? "✓" : i + 1}</span>
                <Art size={72} className={now ? "yv-float" : ""} />
                <p className="mt-2 font-display text-[15px] font-semibold">{st.title}</p>
                <p className="mt-0.5 text-[12px] text-ink-3">{st.body}</p>
                {now && st.href && (
                  <Link href={st.href} className={buttonClass("primary", "sm", "mt-3")}>
                    {st.cta}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Live missions", live, "text-orange"],
          ["Players", players, "text-sky"],
          ["Finished", finishers, "text-reward"],
          ["Visitors", visitors, "text-ink"],
        ].map(([label, value, cls]) => (
          <div key={label as string} className="rounded-[18px] border border-line bg-card p-4">
            <p className="text-[12px] font-semibold text-ink-3">{label}</p>
            <p className={`mt-1 font-display text-[32px] font-bold leading-none tabular ${cls}`}>{value as number}</p>
          </div>
        ))}
      </section>

      <HowItWorks />
    </div>
  );
}
