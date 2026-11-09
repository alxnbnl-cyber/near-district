import { route } from "@/server/http";
import { db } from "@/server/db";
import { requireMyOrg } from "@/server/org";
import { requireOrgRole } from "@/server/authz";
import { listReviews } from "@/server/hints";

export const GET = route(
  async (_req, { user }) => {
    const database = await db();
    const { org } = await requireMyOrg(database, user!);
    await requireOrgRole(database, user!, org.id, "reviewer");
    return listReviews(database, org.id);
  },
  { auth: "required" },
);
