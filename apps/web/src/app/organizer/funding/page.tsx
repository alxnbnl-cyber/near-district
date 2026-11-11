import Link from "next/link";
import { redirect } from "next/navigation";
import { campaigns, desc, eq, fundingOrders, inArray } from "@yielvy/db";
import { formatDisplay, type CampaignRules } from "@yielvy/core";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { myOrganization } from "@/server/spaces";
import { env } from "@/server/env";
import { network, token } from "@/server/near";
import { buttonClass } from "@/components/ui";
import { GameIcon } from "@/components/host/GameIcon";
import { OrganizerFinanceSummary } from "../OrganizerFinanceSummary";
import { FundingActions } from "./FundingActions";

export const metadata = { title: "Prize funding" };

export default async function FundingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer/funding");
  const database = await db();
  const mine = await myOrganization(database, user.userId);
  if (!mine?.space) redirect("/organizer");
  const camps = await database.select().from(campaigns).where(eq(campaigns.spaceId, mine.space.id)).orderBy(desc(campaigns.createdAt));
  const orders = camps.length ? await database.select().from(fundingOrders).where(inArray(fundingOrders.campaignId, camps.map((c) => c.id))).orderBy(desc(fundingOrders.createdAt)).limit(50) : [];
  const t = token();
  const net = network();
  const vaultDeployed = Boolean(env().VAULT_CONTRACT_ID);
  const funded = camps.filter((c) => ((c.draftRules as CampaignRules | null)?.fundingSource ?? "none") !== "none" || c.vaultCampaignId !== null);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-center gap-5">
        <GameIcon name="earn" size={110} className="yv-float hidden shrink-0 sm:block" />
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-orange-ink">Prize funding</p>
          <h1 className="mt-1 text-[30px] font-bold tracking-[-0.02em]">Put up the prize</h1>
          <p className="mt-1 text-ink-2">Deposit {t.symbol} for each mission. Players see the prize once it&apos;s confirmed on-chain.</p>
        </div>
      </section>

      {!vaultDeployed && (
        <div className="flex items-center gap-3 rounded-[16px] border border-sky/40 bg-sky-wash px-4 py-3 text-[14px]">
          <span className="text-lg">⏳</span>
          <span className="text-sky-ink">Deposits open soon — the prize vault is being audited. You can already preview cross-chain quotes.</span>
        </div>
      )}

      {vaultDeployed && <OrganizerFinanceSummary spaceId={mine.space.id} />}

      {funded.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-line-strong p-8 text-center">
          <p className="font-semibold">No missions with a prize yet</p>
          <Link href="/organizer/campaigns/new" className={buttonClass("primary", "md", "mt-3")}>
            Create a mission
          </Link>
        </div>
      ) : (
        <ul className="yv-stagger flex flex-col gap-4">
          {funded.map((c) => {
            const rules = c.draftRules as CampaignRules | null;
            const steps = [
              ["Set up", c.vaultCampaignId !== null],
              ["Deposit", orders.some((o) => o.campaignId === c.id && ["RECEIVED", "SUPPLIED", "SUPPLY_PENDING"].includes(o.state))],
              ["Confirmed", orders.some((o) => o.campaignId === c.id && ["RECEIVED", "SUPPLIED"].includes(o.state))],
            ] as const;
            return (
              <li key={c.id} className="rounded-[20px] border border-line bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-display text-[18px] font-semibold">{c.title}</p>
                    <p className="text-[13px] text-gold-ink">
                      {`Prize${rules?.plannedDirectBudget ? ` · ${formatDisplay(BigInt(rules.plannedDirectBudget), t.decimals)} ${t.symbol}` : ""}`}
                    </p>
                  </div>
                  <ol className="flex items-center gap-1.5">
                    {steps.map(([label, done], i) => (
                      <li key={label} className="flex items-center gap-1.5">
                        <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${done ? "bg-orange text-[#140c05]" : "bg-paper-2 text-ink-3"}`}>
                          {done ? "✓ " : `${i + 1}. `}
                          {label}
                        </span>
                        {i < steps.length - 1 && <span className="h-px w-3 bg-line-strong" />}
                      </li>
                    ))}
                  </ol>
                </div>
                <FundingActions campaignId={c.id} registered={c.vaultCampaignId !== null} vaultDeployed={vaultDeployed} token={{ symbol: t.symbol, decimals: t.decimals }} />
              </li>
            );
          })}
        </ul>
      )}

      {orders.length > 0 && (
        <details className="rounded-[18px] border border-line bg-card px-5 py-4">
          <summary className="cursor-pointer font-semibold">Deposit history ({orders.length})</summary>
          <ul className="mt-3 divide-y divide-line text-[13px]">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{o.createdAt.toLocaleDateString()} · {"Prize deposit"}</span>
                <span className="tabular">{formatDisplay(o.receivedAmount ?? o.amount, t.decimals)} {t.symbol}</span>
                <span className="text-ink-3">{o.state.toLowerCase().replace(/_/g, " ")}</span>
                {o.nearTxHash && (
                  <a className="text-orange-ink hover:underline" href={net.explorerTxUrl(o.nearTxHash)} target="_blank" rel="noopener noreferrer">
                    View ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
