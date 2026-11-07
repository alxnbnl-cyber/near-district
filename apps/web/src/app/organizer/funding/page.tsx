import { redirect } from "next/navigation";
import { campaigns, desc, eq, fundingOrders, inArray } from "@yielvy/db";
import { formatDisplay } from "@yielvy/core";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { myOrganization } from "@/server/spaces";
import { env } from "@/server/env";
import { network, token } from "@/server/near";
import { Badge, Card, EmptyState, Notice, SectionHeader } from "@/components/ui";
import { OrganizerFinanceSummary } from "../OrganizerFinanceSummary";
import { FundingActions } from "./FundingActions";

export const metadata = { title: "Funding" };

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
  return (
    <div className="flex flex-col gap-8">
      <OrganizerFinanceSummary spaceId={mine.space.id} />

      <section>
        <SectionHeader title="How funding works" />
        <Card className="grid gap-4 p-5 text-sm text-ink-2 md:grid-cols-3">
          <div>
            <p className="font-semibold text-ink">1 · Register</p>
            <p className="mt-1">Your wallet creates the campaign's record in the Yielvy vault contract. Only that wallet can fund it or withdraw from it.</p>
          </div>
          <div>
            <p className="font-semibold text-ink">2 · Deposit {t.symbol}</p>
            <p className="mt-1">Send a reward budget, principal, or both. Coming from another chain? Bridge to your own NEAR account with NEAR Intents first, then deposit.</p>
          </div>
          <div>
            <p className="font-semibold text-ink">3 · Earn & reward</p>
            <p className="mt-1">Principal is supplied to RHEA lending. Interest is collected periodically; only collected interest can be promised to winners.</p>
          </div>
        </Card>
        <p className="mt-2 text-[12.5px] text-ink-3">
          Withdrawals: idle principal any time; promised rewards stay locked. Supplied principal returns when RHEA has unborrowed liquidity, which can take time when the market is busy.
        </p>
      </section>

      {!vaultDeployed && (
        <Notice tone="info" title="Real funding is switched off on this deployment">
          The vault contract isn't deployed yet (it awaits independent audit and your approval). You can preview real cross-chain quotes below; no funds can move.
        </Notice>
      )}

      <section>
        <SectionHeader title="Campaign funding" />
        {camps.length === 0 ? (
          <Card>
            <EmptyState title="Create a campaign first" />
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {camps.map((c) => (
              <Card key={c.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{c.title}</p>
                  {c.vaultCampaignId !== null ? <Badge tone="mint">Vault #{c.vaultCampaignId.toString()}</Badge> : <Badge>Not registered</Badge>}
                </div>
                <FundingActions
                  campaignId={c.id}
                  registered={c.vaultCampaignId !== null}
                  vaultDeployed={vaultDeployed}
                  token={{ symbol: t.symbol, decimals: t.decimals }}
                />
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="Funding history" />
        <Card className="overflow-x-auto">
          {orders.length === 0 ? (
            <EmptyState title="No funding activity yet" />
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="text-ink-3">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">State</th>
                  <th className="px-4 py-2 font-medium">Transaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2">{o.createdAt.toLocaleString()}</td>
                    <td className="px-4 py-2">{o.kind} · {o.route}</td>
                    <td className="px-4 py-2 tabular">{formatDisplay(o.receivedAmount ?? o.amount, t.decimals)} {t.symbol}</td>
                    <td className="px-4 py-2"><Badge tone={o.state === "RECEIVED" || o.state === "SUPPLIED" ? "mint" : o.state === "FAILED" || o.state === "EXPIRED" ? "danger" : "gold"}>{o.state}</Badge></td>
                    <td className="px-4 py-2">{o.nearTxHash ? <a className="text-orange-ink hover:underline" href={net.explorerTxUrl(o.nearTxHash)} target="_blank" rel="noopener noreferrer">{o.nearTxHash.slice(0, 10)}… ↗</a> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </div>
  );
}
