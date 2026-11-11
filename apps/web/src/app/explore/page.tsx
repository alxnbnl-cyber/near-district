import { WorldExperience } from "@/components/explore/WorldExperience";
import { getWorldData } from "@/server/world";
import { getSessionUser } from "@/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Explore" };

/** Full-screen map: no top navigation — the HUD on the map is the navigation. */
export default async function Page() {
  const user = await getSessionUser();
  const data = await getWorldData(user?.userId ?? null);
  return (
    <main className="h-dvh w-full">
      <h1 className="sr-only">NEAR District — explore a map of projects, missions and creative challenges</h1>
      <WorldExperience data={data} initialMode="explore" viewer={user ? { displayName: user.displayName, isAdmin: user.adminRoles.length > 0 } : null} />
    </main>
  );
}
