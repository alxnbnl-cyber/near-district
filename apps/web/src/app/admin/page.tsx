import { redirect } from "next/navigation";
import { auditLogs, desc, eq, jobs, moderationReports, organizations, qualifications, reconciliationRuns, spaces, users, campaigns } from "@yielvy/db";
import { formatDisplay } from "@yielvy/core";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { Card, EmptyState, Figure, Notice, SectionHeader } from "@/components/ui";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { token, vault } from "@/server/near";
import { AdminAction } from "./AdminAction";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/admin");
  if (user.adminRoles.length === 0) redirect("/");
  const database = await db();
  const [pendingSpaces, reports, held, audits, dead, recon] = await Promise.all([
    database
      .select({ s: spaces, org: organizations })
      .from(spaces)
      .innerJoin(organizations, eq(organizations.id, spaces.organizationId))
      .where(eq(spaces.moderation, "pending"))
      .orderBy(desc(spaces.createdAt))
      .limit(50),
    database.select().from(moderationReports).where(eq(moderationReports.status, "open")).orderBy(desc(moderationReports.createdAt)).limit(50),
    database
      .select({ q: qualifications, name: users.displayName, title: campaigns.title })
      .from(qualifications)
      .innerJoin(users, eq(users.id, qualifications.userId))
      .innerJoin(campaigns, eq(campaigns.id, qualifications.campaignId))
      .where(eq(qualifications.status, "held"))
      .limit(50),
    database.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(30),
    database.select().from(jobs).where(eq(jobs.status, "dead")).orderBy(desc(jobs.updatedAt)).limit(20),
    database.select().from(reconciliationRuns).orderBy(desc(reconciliationRuns.startedAt)).limit(1),
  ]);

  const v = vault();
  const t = token();
  let vaultInfo: { totals: Awaited<ReturnType<NonNullable<typeof v>["totals"]>>; config: Awaited<ReturnType<NonNullable<typeof v>["config"]>> } | null = null;
  let vaultError: string | null = null;
  if (v) {
    try {
      vaultInfo = { totals: await v.totals(), config: await v.config() };
    } catch (e) {
      vaultError = String(e);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-orange-ink">Admin · {user.adminRoles.join(", ")}</p>
          <h1 className="text-2xl font-semibold">Operations</h1>
        </div>

        <section>
          <SectionHeader title="Vault & money" />
          {!v ? (
            <Notice tone="info">No vault contract is configured (VAULT_CONTRACT_ID unset). No funds are held by Yielvy on this deployment.</Notice>
          ) : vaultError ? (
            <Notice tone="danger" title="Vault unreachable">{vaultError}</Notice>
          ) : (
            vaultInfo && (
              <Card className="grid grid-cols-2 gap-6 p-5 md:grid-cols-4">
                <Figure label="Liquid tracked" value={formatDisplay(BigInt(vaultInfo.totals.liquid_tracked), t.decimals)} unit={t.symbol} />
                <Figure label="RHEA shares" value={vaultInfo.totals.total_rhea_shares} />
                <Figure label="Fees accrued" value={formatDisplay(BigInt(vaultInfo.totals.fees_accrued), t.decimals)} unit={t.symbol} />
                <Figure label="Pause" value={vaultInfo.config.pause.all ? "All" : vaultInfo.config.pause.inflows ? "Inflows" : "None"} help="Guardian/owner pause via the contract, signed by the guardian key." />
                {vaultInfo.totals.pending_op && (
                  <div className="col-span-full">
                    <Notice tone="warn" title={`In-flight RHEA operation #${vaultInfo.totals.pending_op.op_id}`}>
                      {vaultInfo.totals.pending_op.purpose} for campaign {vaultInfo.totals.pending_op.campaign_id}, started at block {vaultInfo.totals.pending_op.started_height}.
                    </Notice>
                  </div>
                )}
              </Card>
            )
          )}
          <p className="mt-2 text-[12.5px] text-ink-3">
            Last reconciliation: {recon[0] ? `${recon[0].status} at ${recon[0].startedAt.toISOString()}` : "never run"}. Emergency pause is executed with the guardian key against the
            contract (see docs/operations/incident-response.md); the web app holds no keys.
          </p>
        </section>

        <section>
          <SectionHeader title={`Projects awaiting review (${pendingSpaces.length})`} />
          <Card className="divide-y divide-line">
            {pendingSpaces.length === 0 && <EmptyState title="Nothing to review" />}
            {pendingSpaces.map(({ s, org }) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.name} <span className="font-normal text-ink-3">· {org.name}</span></p>
                  <p className="text-[13px] text-ink-2">{s.tagline}</p>
                  {s.websiteUrl && <p className="text-[12.5px] text-ink-3">{s.websiteUrl}</p>}
                </div>
                <AdminAction kind="space" id={s.id} actions={[["approved", "Approve"], ["rejected", "Reject"]]} />
              </div>
            ))}
          </Card>
        </section>

        <section>
          <SectionHeader title={`Qualifications on hold (${held.length})`} />
          <Card className="divide-y divide-line">
            {held.length === 0 && <EmptyState title="No held qualifications" />}
            {held.map(({ q, name, title }) => (
              <div key={q.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{name} <span className="font-normal text-ink-3">· {title}</span></p>
                  <p className="text-[13px] text-ink-2">{q.holdReason}</p>
                </div>
                <AdminAction kind="qualification" id={q.id} needReason actions={[["qualified", "Clear"], ["revoked", "Revoke"]]} />
              </div>
            ))}
          </Card>
        </section>

        <section>
          <SectionHeader title={`Open reports (${reports.length})`} />
          <Card className="divide-y divide-line">
            {reports.length === 0 && <EmptyState title="No open reports" />}
            {reports.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.reason} · {r.targetType}</p>
                  <p className="text-[13px] text-ink-2">{r.details || "No details"}</p>
                  <p className="text-[12px] text-ink-3">{r.targetId}</p>
                </div>
                <AdminAction kind="report" id={r.id} actions={[["actioned", "Mark actioned"], ["dismissed", "Dismiss"]]} />
              </div>
            ))}
          </Card>
        </section>

        <section>
          <SectionHeader title="Failed background jobs" />
          <Card className="divide-y divide-line">
            {dead.length === 0 && <EmptyState title="No stuck jobs" />}
            {dead.map((j) => (
              <div key={j.id} className="px-5 py-3 text-sm">
                <p className="font-semibold">{j.name} · {j.attempts} attempts</p>
                <p className="font-mono text-[12px] text-danger">{j.lastError}</p>
              </div>
            ))}
          </Card>
        </section>

        <section>
          <SectionHeader title="Audit log" />
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="text-ink-3">
                <tr><th className="px-4 py-2 font-medium">When</th><th className="px-4 py-2 font-medium">Action</th><th className="px-4 py-2 font-medium">Target</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {audits.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-ink-3">{a.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                    <td className="px-4 py-2 font-mono">{a.action}</td>
                    <td className="px-4 py-2 text-ink-2">{a.targetType} {a.targetId?.slice(0, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      </main>
    </>
  );
}
