import { redirect } from "next/navigation";

/** Old mission page: missions now open over the map, so send visitors there. */
export default async function QuestPage({ params }: { params: Promise<{ slug: string; campaign: string }> }) {
  const p = await params;
  redirect(`/explore?m=${encodeURIComponent(`${p.slug}/${p.campaign}`)}`);
}
