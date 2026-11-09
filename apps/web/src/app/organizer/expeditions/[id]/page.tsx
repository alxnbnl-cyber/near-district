import { redirect } from "next/navigation";
import { SectionHeader } from "@/components/ui";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/session";
import { myOrganization } from "@/server/spaces";
import { ExpeditionEditor } from "./ExpeditionEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Expedition" };

export default async function ExpeditionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/signin?next=/organizer/expeditions/${id}`);
  const mine = await myOrganization(await db(), user.userId);
  if (!mine?.space) redirect("/organizer");
  return (
    <div>
      <SectionHeader eyebrow="Shared expedition" title="Expedition" />
      <ExpeditionEditor id={id} canManage={mine.role === "owner" || mine.role === "admin"} />
    </div>
  );
}
