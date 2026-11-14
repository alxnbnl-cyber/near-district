import { campaigns, eq, isNotNull, and } from "@near-district/db";
import { formatDisplay } from "@near-district/core";
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
        <Notice tone="info" title="On-chain prizes are not switched on here">
          The NEAR District prize vault is not configured on this deployment. Missions can be designed and tested now; prizes can be locked once it is. Nothing here is simulated.
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
  let locked = 0n, paid = 0n, refunded = 0n, owed = 0n;
  let error: string | null = null;
  try {
    for (const r of rows) {
      const m = await v.mission(r.vaultId!);
      if (!m) continue;
      locked += BigInt(m.prize) - BigInt(m.paid_total) - BigInt(m.refunded_total) - BigInt(m.refund_owed);
      paid += BigInt(m.paid_total);
      refunded += BigInt(m.refunded_total);
      owed += BigInt(m.refund_owed);
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
          <Figure label="Locked in the vault" value={fmt(locked)} unit={t.symbol} help="Fixed prizes held in escrow until the deadline, then split equally among everyone who solved every secret." />
          <Figure label="Paid to winners" value={fmt(paid)} unit={t.symbol} help="Sent automatically to winners' NEAR wallets by the prize vault." />
          <Figure label="Back to you" value={fmt(refunded + owed)} unit={t.symbol} help="Rounding remainders, or the whole prize if nobody solved every secret." />
        </Card>
      )}
    </section>
  );
}
