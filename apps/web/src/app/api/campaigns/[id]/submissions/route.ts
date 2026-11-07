import { headers } from "next/headers";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { submitEntry } from "@/server/contest";
import { submissionInput } from "@/lib/campaign-schemas";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(
  async (req, { user, params }) => {
    const { id } = await params;
    const input = await body(req, submissionInput);
    const country = (await headers()).get(env().COUNTRY_HEADER);
    const row = await submitEntry(await db(), user!, id, input, country);
    return { id: row.id };
  },
  { auth: "required" },
);
