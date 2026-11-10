import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { db } from "@/server/db";
import { myOrganization } from "@/server/spaces";
import { buttonClass } from "@/components/ui";
import { SpaceSettingsForm } from "./SpaceSettingsForm";

export const metadata = { title: "Profile" };

export default async function MyVaultPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/organizer/space");
  const database = await db();
  const mine = await myOrganization(database, user.userId);
  if (!mine?.space) redirect("/organizer");
  const s = mine.space;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-orange-ink">Profile</p>
          <h1 className="mt-1 text-[30px] font-bold tracking-[-0.02em]">How explorers see you</h1>
        </div>
        {s.moderation === "approved" && (
          <Link href={`/s/${s.slug}`} className={buttonClass("secondary", "sm")}>
            View on the map
          </Link>
        )}
      </div>
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
