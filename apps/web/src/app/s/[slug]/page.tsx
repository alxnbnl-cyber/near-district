import { redirect } from "next/navigation";

/** Old company page: companies now live on the map, so send visitors to their pin. */
export default async function SpacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/explore?space=${encodeURIComponent(slug)}`);
}
