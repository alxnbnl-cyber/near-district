import { notFound, redirect } from "next/navigation";
import { getPublicCampaign } from "@/server/public";

export const dynamic = "force-dynamic";

/** Missions are played in a modal over the map; old links land there. */
export default async function QuestPage({ params }: { params: Promise<{ slug: string; campaign: string }> }) {
  const p = await params;
  const d = await getPublicCampaign(p.slug, p.campaign);
  if (!d) notFound();
  redirect(`/explore?m=${encodeURIComponent(`${d.space.slug}/${d.campaign.slug}`)}`);
}
