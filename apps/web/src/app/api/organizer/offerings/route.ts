import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { requireMyOrg } from "@/server/org";
import { createOffering, listMyOfferings } from "@/server/partners";
import { onchainEnabled, orgBuilderOptions } from "@/server/hints";
import { offeringInput } from "@/lib/hint-schemas";

export const GET = route(
  async (_req, { user }) => {
    const database = await db();
    const { org } = await requireMyOrg(database, user!);
    const [offerings, options] = await Promise.all([listMyOfferings(database, org.id), orgBuilderOptions(database, org.id)]);
    return { offerings, options: { ...options, partnerOfferings: [] } };
  },
  { auth: "required" },
);

export const POST = route(
  async (req, { user }) => {
    const input = await body(req, offeringInput);
    const database = await db();
    const { org } = await requireMyOrg(database, user!);
    const row = await createOffering(database, user!, org.id, input, { onchainEnabled: onchainEnabled() });
    return { id: row.id };
  },
  { auth: "required" },
);
