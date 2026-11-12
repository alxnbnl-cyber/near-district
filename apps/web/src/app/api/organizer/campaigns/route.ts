import { desc, eq, campaigns } from "@yielvy/db";
import { body, notFound, route } from "@/server/http";
import { db } from "@/server/db";
import { myOrganization } from "@/server/spaces";
import { requireOrgRole } from "@/server/authz";
import { createDraft } from "@/server/campaigns";
import { createCampaignInput } from "@/lib/campaign-schemas";
import { rateLimit } from "@/server/rate-limit";

export const GET = route(
  async (_req, { user }) => {
    const database = await db();
    const mine = await myOrganization(database, user!.userId);
    if (!mine?.space) throw notFound("You don't have a company profile yet.");
    return database.select().from(campaigns).where(eq(campaigns.spaceId, mine.space.id)).orderBy(desc(campaigns.createdAt));
  },
  { auth: "required" },
);

export const POST = route(
  async (req, { user }) => {
    const input = await body(req, createCampaignInput);
    const database = await db();
    const mine = await myOrganization(database, user!.userId);
    if (!mine?.space) throw notFound("Create your company profile first.");
    await requireOrgRole(database, user!, mine.org.id, "editor");
    await rateLimit(database, `campaign-create:${user!.userId}`, 20, 3600);
    const c = await createDraft(database, user!, mine.space.id, input);
    return { id: c.id };
  },
  { auth: "required" },
);
