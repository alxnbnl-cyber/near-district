import Link from "next/link";
import { redirect } from "next/navigation";
import { campaigns, desc, eq, rewardAllocations, rewardClaims, rewardPeriods, spaces } from "@yielvy/db";
import { formatDisplay } from "@yielvy/core";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { Badge, Card, EmptyState, Notice, buttonClass } from "@/components/ui";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { network, token } from "@/server/near";
import { env } from "@/server/env";
import { ClaimButton } from "./ClaimButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Rewards" };

export default async function MyRewards() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/me/rewards");
  const database = await db();
  const rows = await database
    .select({ a: rewardAllocations, p: rewardPeriods, c: campaigns, space: spaces, claim: rewardClaims })
    .from(rewardAllocations)
    .innerJoin(rewardPeriods, eq(rewardPeriods.id, rewardAllocations.rewardPeriodId))
    .innerJoin(campaigns, eq(campaigns.id, rewardPeriods.campaignId))
    .innerJoin(spaces, eq(spaces.id, campaigns.spaceId))
    .leftJoin(rewardClaims, eq(rewardClaims.allocationId, rewardAllocations.id))
    .where(eq(rewardAllocations.userId, user.userId))
    .orderBy(desc(rewardAllocations.createdAt));
  const t = token();
  const net = network();
  const now = new Date();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-semibold">My Rewards</h1>
        <p className="mt-1 text-ink-2">Prizes you win are paid automatically to your NEAR wallet after the deadline.</p>
        {!user.payoutAccountId && (
          <div className="mt-6">
            <Notice tone="warn" title="No payout wallet yet">
              Prizes are paid to the NEAR wallet you signed in with. <Link href="/me/profile" className="font-semibold underline">Link one in your profile</Link>.
            </Notice>
          </div>
        )}
        {rows.length === 0 ? (
          <Card className="mt-8">
            <EmptyState title="No rewards yet" action={<Link href="/explore?tab=experiences" className={buttonClass("secondary")}>Find a mission</Link>}>
              Decrypt every secret in a mission and your prize shows up here.
            </EmptyState>
          </Card>
        ) : (
          <ul className="mt-8 flex flex-col gap-3">
            {rows.map(({ a, p, c, space, claim }) => {
              const claimable = p.state === "CLAIMABLE" && p.claimableAfter && p.claimableAfter <= now && p.claimDeadline && p.claimDeadline > now;
              const expired = p.claimDeadline && p.claimDeadline <= now && claim?.state !== "CONFIRMED";
              return (
                <li key={a.id}>
                  <Card className="flex flex-wrap items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-ink-3">{space.name} · period {p.periodNumber}</p>
                      <p className="font-semibold">{c.title}</p>
                      <p className="font-display text-xl font-semibold tabular">{formatDisplay(a.amount, t.decimals)} {t.symbol}</p>
                      <p className="text-[12.5px] text-ink-3">To {a.accountId}</p>
                    </div>
                    {claim?.state === "CONFIRMED" ? (
                      <div className="text-right">
                        <Badge tone="mint">Claimed</Badge>
                        {claim.txHash && (
                          <a className="mt-1 block text-[12.5px] text-orange-ink hover:underline" href={net.explorerTxUrl(claim.txHash)} target="_blank" rel="noopener noreferrer">
                            View transaction ↗
                          </a>
                        )}
                      </div>
                    ) : expired ? (
                      <Badge tone="danger">Expired</Badge>
                    ) : claimable && env().VAULT_CONTRACT_ID ? (
                      <ClaimButton allocationId={a.id} pending={claim?.state === "SUBMITTED"} />
                    ) : (
                      <Badge tone="sky">{p.claimableAfter && p.claimableAfter > now ? `Paying from ${p.claimableAfter.toLocaleDateString()}` : "Finalizing"}</Badge>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
