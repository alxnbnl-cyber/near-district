import { z } from "zod";
import { moderationReports } from "@yielvy/db";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { plainText } from "@/lib/schemas";

const input = z.object({
  targetType: z.enum(["space", "campaign", "submission", "user"]),
  targetId: z.string().uuid(),
  reason: z.enum(["spam", "abuse", "impersonation", "copyright", "malicious_link", "unfair_campaign", "other"]),
  details: plainText(2000).default(""),
});

/** Anyone signed in can report content; reports go to the admin moderation queue. */
export const POST = route(
  async (req, { user }) => {
    const r = await body(req, input);
    const database = await db();
    await rateLimit(database, `report:${user!.userId}`, 10, 3600);
    await database.insert(moderationReports).values({ ...r, reporterUserId: user!.userId });
    return { ok: true };
  },
  { auth: "required" },
);
