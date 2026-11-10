import { redirect } from "next/navigation";

/** The owner dashboard explains everything itself; no separate landing page. */
export default function HostPage() {
  redirect("/organizer");
}
