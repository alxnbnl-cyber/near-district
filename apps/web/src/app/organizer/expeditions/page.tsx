import { redirect } from "next/navigation";
import { SectionHeader } from "@/components/ui";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/session";
import { myOrganization } from "@/server/spaces";
import { ExpeditionsPanel } from "./ExpeditionsPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Expeditions" };

export default async function ExpeditionsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer/expeditions");
  const mine = await myOrganization(await db(), user.userId);
  if (!mine?.space) redirect("/organizer");
  return (
    <div>
      <SectionHeader eyebrow="Cooperation" title="Shared expeditions" />
      <ExpeditionsPanel canManage={mine.role === "owner" || mine.role === "admin"} />
    </div>
  );
}
