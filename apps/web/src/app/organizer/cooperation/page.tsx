import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/session";
import { myOrganization } from "@/server/spaces";
import { CooperationPanel } from "./CooperationPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cooperation" };

export default async function CooperationPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer/cooperation");
  const mine = await myOrganization(await db(), user.userId);
  if (!mine?.space) redirect("/organizer");
  return <CooperationPanel canManage={mine.role === "owner" || mine.role === "admin"} />;
}
