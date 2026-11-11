import { z } from "zod";
import { body, notFound, route } from "@/server/http";
import { db } from "@/server/db";
import { myOrganization } from "@/server/spaces";
import { createAppKey, listAppKeys, revokeAppKey } from "@/server/partner-events";

async function org(userId: string) {
  const mine = await myOrganization(await db(), userId);
  if (!mine) throw notFound("You don't have a company profile yet.");
  return mine.org.id;
}

export const GET = route(async (_req, { user }) => ({ keys: await listAppKeys(await db(), user!, await org(user!.userId)) }), { auth: "required" });

export const POST = route(
  async (req, { user }) => {
    const { label } = await body(req, z.object({ label: z.string().max(60).default("") }));
    return createAppKey(await db(), user!, await org(user!.userId), label);
  },
  { auth: "required" },
);

export const DELETE = route(
  async (req, { user }) => {
    const { keyId } = await body(req, z.object({ keyId: z.string().regex(/^yk_[0-9a-f]{18}$/) }));
    await revokeAppKey(await db(), user!, await org(user!.userId), keyId);
    return { ok: true };
  },
  { auth: "required" },
);
