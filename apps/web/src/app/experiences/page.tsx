import { redirect } from "next/navigation";

/** Experiences now live inside the map HUD. */
export default function ExperiencesPage() {
  redirect("/explore?tab=experiences");
}
