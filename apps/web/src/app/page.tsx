import { SiteHeader } from "@/components/shell/SiteHeader";
import { MobileNav } from "@/components/shell/NavLinks";
import { WorldExperience } from "@/components/explore/WorldExperience";
import { getWorldData } from "@/server/world";

export const dynamic = "force-dynamic";

/** First visit: welcome scene over the live world. Returning visitors continue straight to /explore. */
export default async function HomePage() {
  const data = await getWorldData();
  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader mobileRow={false} />
      <main className="relative min-h-0 flex-1">
        <WorldExperience data={data} initialMode="welcome" />
      </main>
      <MobileNav />
    </div>
  );
}
