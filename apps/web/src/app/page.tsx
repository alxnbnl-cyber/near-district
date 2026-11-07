import { Suspense } from "react";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { WorldExplorer } from "@/components/world/WorldExplorer";
import { getWorldData } from "@/server/world";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getWorldData();
  return (
    <main>
      <h1 className="sr-only">Yielvy — explore a town of projects, hunts and creative challenges</h1>
      <SiteHeader overlay />
      <Suspense>
        <WorldExplorer data={data} />
      </Suspense>
    </main>
  );
}
