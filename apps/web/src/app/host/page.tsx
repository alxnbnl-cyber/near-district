import { redirect } from "next/navigation";

/** Entry point for companies; keeps where they came from so "Back" returns there. */
export default async function HostPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  redirect(from === "map" || from === "home" ? `/organizer?from=${from}` : "/organizer");
}
