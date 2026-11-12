import { body, notFound, route } from "@/server/http";
import { db } from "@/server/db";
import { createSpace, myOrganization, updateSpace } from "@/server/spaces";
import { rateLimit } from "@/server/rate-limit";
import { spaceInput, spaceUpdate } from "@/lib/schemas";

export const POST = route(
  async (req, { user }) => {
    const input = await body(req, spaceInput);
    const database = await db();
    await rateLimit(database, `space-create:${user!.userId}`, 5, 3600);
    const { space, plot } = await createSpace(database, user!, input);
    return { spaceId: space.id, slug: space.slug, plot, moderation: space.moderation };
  },
  { auth: "required" },
);

export const PATCH = route(
  async (req, { user }) => {
    const patch = await body(req, spaceUpdate.partial());
    const database = await db();
    const mine = await myOrganization(database, user!.userId);
    if (!mine?.space) throw notFound("You don't have a company profile yet.");
    await updateSpace(database, user!, mine.space.id, patch);
    return { ok: true };
  },
  { auth: "required" },
);
