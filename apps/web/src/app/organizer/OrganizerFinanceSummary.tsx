import { campaigns, eq, isNotNull, and } from "@yielvy/db";
import { formatDisplay } from "@yielvy/core";
import { db } from "@/server/db";
import { token, vault } from "@/server/near";
import { Card, Figure, Notice, SectionHeader } from "@/components/ui";

/**
 * Money figures are read live from the vault contract and RHEA — never from our database —
 * and shown with their provenance. If the vault isn't deployed, we say so.
 */
export async function OrganizerFinanceSummary({ spaceId }: { spaceId: string }) {
  const v = vault();
  if (!v) {
    return (
      <section>
        <SectionHeader eyebrow="Funding" title="Prizes" />
        <Notice tone="info" title="On-chain funding is not switched on yet">
          The NEAR District vault contract has not been deployed on this network. Campaigns can be designed and tested now; funding opens after the contract audit and
          launch checks. Nothing here is simulated.
        </Notice>
      </section>
    );
  }
  const database = await db();
  const rows = await database
    .select({ id: campaigns.id, title: campaigns.title, vaultId: campaigns.vaultCampaignId })
    .from(campaigns)
    .where(and(eq(campaigns.spaceId, spaceId), isNotNull(campaigns.vaultCampaignId)));
  const t = token();
  let available = 0n, reserved = 0n, claimed = 0n;
  let error: string | null = null;
  try {
    for (const r of rows) {
      const c = await v.campaign(r.vaultId!);
      if (!c) continue;
      available += BigInt(c.bonus_available);
      reserved += BigInt(c.reserved);
      claimed += BigInt(c.claimed_total);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const fmt = (x: bigint) => formatDisplay(x, t.decimals);
  return (
    <section>
      <SectionHeader eyebrow="Funding" title="Prizes" />
      {error ? (
        <Notice tone="warn" title="Couldn't reach the chain just now">
          {error}. Balances are not shown rather than shown stale.
        </Notice>
      ) : (
        <Card className="grid grid-cols-2 gap-6 p-5 md:grid-cols-3">
          <Figure label="Prize in vault" value={fmt(available + reserved)} unit={t.symbol} help="Fixed prizes you deposited that haven't been paid out." />
          <Figure label="Not yet promised" value={fmt(available)} unit={t.symbol} help="Yours to withdraw if the mission ends with no winners." />
          <Figure label="Promised to winners" value={fmt(reserved)} unit={t.symbol} help="Locked for finalized rewards. Cannot be withdrawn." />
          <Figure label="Paid out" value={fmt(claimed)} unit={t.symbol} help="Claimed by winners on-chain." />
        </Card>
      )}
    </section>
  );
}
