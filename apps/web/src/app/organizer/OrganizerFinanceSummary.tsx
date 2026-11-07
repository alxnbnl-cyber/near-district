import { campaigns, eq, isNotNull, and } from "@yielvy/db";
import { formatDisplay } from "@yielvy/core";
import { sharesToTokens } from "@yielvy/near";
import { db } from "@/server/db";
import { rhea, token, vault } from "@/server/near";
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
        <SectionHeader eyebrow="Funding" title="Rewards & capital" />
        <Notice tone="info" title="On-chain funding is not switched on yet">
          The Yielvy vault contract has not been deployed on this network. Campaigns can be designed and tested now; funding opens after the contract audit and
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
  let principal = 0n, position = 0n, realized = 0n, available = 0n, reserved = 0n, claimed = 0n;
  let error: string | null = null;
  try {
    const asset = rows.length ? await rhea().getAsset(t) : null;
    for (const r of rows) {
      const c = await v.campaign(r.vaultId!);
      if (!c) continue;
      principal += BigInt(c.principal_idle) + BigInt(c.principal_supplied);
      if (asset) position += sharesToTokens(BigInt(c.rhea_shares), asset);
      realized += BigInt(c.yield_realized_total);
      available += BigInt(c.yield_available) + BigInt(c.bonus_available);
      reserved += BigInt(c.reserved);
      claimed += BigInt(c.claimed_total);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const fmt = (x: bigint) => formatDisplay(x, t.decimals);
  return (
    <section>
      <SectionHeader eyebrow="Funding" title="Rewards & capital" />
      {error ? (
        <Notice tone="warn" title="Couldn't reach the chain just now">
          {error}. Balances are not shown rather than shown stale.
        </Notice>
      ) : (
        <Card className="grid grid-cols-2 gap-6 p-5 md:grid-cols-3">
          <Figure label="Principal deposited" value={fmt(principal)} unit={t.symbol} help="Your capital. Yours to withdraw (subject to lending liquidity)." />
          <Figure label="Lending position value" value={fmt(position)} unit={t.symbol} help="Current value of your share of the RHEA supply position." />
          <Figure label="Interest collected" value={fmt(realized)} unit={t.symbol} help="Yield actually withdrawn and settled, after fees." />
          <Figure label="Available for rewards" value={fmt(available)} unit={t.symbol} help="Collected interest plus direct reward budget, not yet promised." />
          <Figure label="Promised to winners" value={fmt(reserved)} unit={t.symbol} help="Locked for finalized rewards. Cannot be withdrawn." />
          <Figure label="Paid out" value={fmt(claimed)} unit={t.symbol} help="Claimed by winners on-chain." />
        </Card>
      )}
    </section>
  );
}
