import { redirect } from "next/navigation";
import { SectionHeader } from "@/components/ui";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/session";
import { myOrganization } from "@/server/spaces";
import { PartnersPanel } from "./PartnersPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partners" };

export default async function PartnersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer/partners");
  const mine = await myOrganization(await db(), user.userId);
  if (!mine?.space) redirect("/organizer");
  return (
    <div>
      <SectionHeader eyebrow="Cooperation" title="Partners" />
      <PartnersPanel canManage={mine.role === "owner" || mine.role === "admin"} />
    </div>
  );
}
