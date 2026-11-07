import { headers } from "next/headers";
import { route } from "@/server/http";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { joinCampaign } from "@/server/play";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(
  async (_req, { user, params }) => {
    const { id } = await params;
    const country = (await headers()).get(env().COUNTRY_HEADER);
    const entry = await joinCampaign(await db(), user!, id, country);
    return { entryId: entry.id };
  },
  { auth: "required" },
);
