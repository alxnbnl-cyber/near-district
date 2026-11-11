import { redirect } from "next/navigation";
import { HostHeader } from "../HostHeader";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/session";
import { myOrganization } from "@/server/spaces";
import { ReviewsPanel } from "./ReviewsPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reviews" };

export default async function ReviewsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer/reviews");
  const mine = await myOrganization(await db(), user.userId);
  if (!mine?.space) redirect("/organizer");
  return (
    <div>
      <HostHeader eyebrow="Hint activities" title="Reviews" />
      <ReviewsPanel />
    </div>
  );
}
