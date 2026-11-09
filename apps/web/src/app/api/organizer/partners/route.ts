import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { requireMyOrg } from "@/server/org";
import { invitePartner, listPartnerships } from "@/server/partners";
import { partnerInviteInput } from "@/lib/hint-schemas";

export const GET = route(
  async (_req, { user }) => {
    const database = await db();
    const { org } = await requireMyOrg(database, user!);
    return listPartnerships(database, org.id);
  },
  { auth: "required" },
);

export const POST = route(
  async (req, { user }) => {
    const input = await body(req, partnerInviteInput);
    const database = await db();
    const { org } = await requireMyOrg(database, user!);
    const row = await invitePartner(database, user!, org.id, input);
    return { id: row.id };
  },
  { auth: "required" },
);
