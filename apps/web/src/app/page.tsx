import { WorldExperience } from "@/components/explore/WorldExperience";
import { getWorldData } from "@/server/world";
import { getSessionUser } from "@/server/session";

export const dynamic = "force-dynamic";


/** Full-screen map: no top navigation — the HUD on the map is the navigation. */
export default async function Page() {
  const user = await getSessionUser();
  const data = await getWorldData(user?.userId ?? null);
  return (
    <main className="h-dvh w-full">
      <h1 className="sr-only">Yielvy — explore a map of projects, treasure hunts and creative challenges</h1>
      <WorldExperience data={data} initialMode="welcome" viewer={user ? { displayName: user.displayName, isAdmin: user.adminRoles.length > 0 } : null} />
    </main>
  );
}
