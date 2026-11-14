import { and, count, desc, eq, isNull, notifications } from "@near-district/db";
import { route } from "@/server/http";
import { db } from "@/server/db";

export const GET = route(
  async (_req, { user }) => {
    const database = await db();
    const items = await database
      .select({ id: notifications.id, title: notifications.title, body: notifications.body, link: notifications.link, readAt: notifications.readAt, createdAt: notifications.createdAt })
      .from(notifications)
      .where(eq(notifications.userId, user!.userId))
      .orderBy(desc(notifications.createdAt))
      .limit(20);
    const [{ n } = { n: 0 }] = await database
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, user!.userId), isNull(notifications.readAt)));
    return { items, unread: n };
  },
  { auth: "required" },
);

/** Marks all as read. */
export const POST = route(
  async (_req, { user }) => {
    const database = await db();
    await database.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user!.userId), isNull(notifications.readAt)));
    return { ok: true };
  },
  { auth: "required" },
);
