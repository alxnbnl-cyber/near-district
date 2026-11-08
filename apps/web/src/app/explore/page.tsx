import { SiteHeader } from "@/components/shell/SiteHeader";
import { MobileNav } from "@/components/shell/NavLinks";
import { WorldExperience } from "@/components/explore/WorldExperience";
import { getWorldData } from "@/server/world";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explore" };

export default async function ExplorePage() {
  const data = await getWorldData();
  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader mobileRow={false} />
      <main className="relative min-h-0 flex-1">
        <h1 className="sr-only">Explore the Yielvy map</h1>
        <WorldExperience data={data} initialMode="explore" />
      </main>
      <MobileNav />
    </div>
  );
}
