import Link from "next/link";
import { redirect } from "next/navigation";
import { and, count, eq, analyticsEvents } from "@yielvy/db";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { myOrganization } from "@/server/spaces";
import { Card, Figure, SectionHeader, buttonClass } from "@/components/ui";
import { SpaceSettingsForm } from "./SpaceSettingsForm";

export const metadata = { title: "My Space" };

export default async function MySpacePage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer/space");
  const database = await db();
  const mine = await myOrganization(database, user.userId);
  if (!mine?.space) redirect("/organizer");
  const s = mine.space;
  const [{ n: views } = { n: 0 }] = await database.select({ n: count() }).from(analyticsEvents).where(and(eq(analyticsEvents.spaceId, s.id), eq(analyticsEvents.kind, "space_view")));
  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        eyebrow="My Space"
        title={s.name}
        action={s.moderation === "approved" ? <Link href={`/s/${s.slug}`} className={buttonClass("secondary", "sm")}>View public page</Link> : null}
      />
      <Card className="grid grid-cols-2 gap-6 p-5">
        <Figure kind="record" label="Visitors (unique per day)" value={views} help="Counted without storing IPs; the visitor hash rotates daily." />
        <Figure kind="record" label="Review status" value={s.moderation} />
      </Card>
      <SpaceSettingsForm
        initial={{
          name: s.name,
          tagline: s.tagline,
          description: s.description,
          websiteUrl: s.websiteUrl ?? "",
          buildingStyle: s.buildingStyle,
          socials: s.socials ?? {},
          logoUploadId: s.logoUploadId,
          bannerUploadId: s.bannerUploadId,
        }}
      />
    </div>
  );
}
