import { z } from "zod";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { issueLinkCode } from "@/server/partner-events";

/** A player asks for a one-time code to enter in a company's app (links that app's events to them). */
export const POST = route(
  async (req, { user }) => {
    const { organizationId } = await body(req, z.object({ organizationId: z.string().uuid() }));
    const database = await db();
    await rateLimit(database, `link-code:${user!.userId}`, 20, 3600);
    return issueLinkCode(database, user!, organizationId);
  },
  { auth: "required" },
);
