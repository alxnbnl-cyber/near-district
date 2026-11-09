import { z } from "zod";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { decideReview } from "@/server/hints";
import { plainText } from "@/lib/schemas";

type Ctx = { params: Promise<{ vid: string }> };

/** Approve/reject a manual activity. The engine checks the reviewer belongs to the activity owner. */
export const POST = route<Ctx>(
  async (req, { user, params }) => {
    const { vid } = await params;
    const { decision, note } = await body(req, z.object({ decision: z.enum(["approve", "reject"]), note: plainText(1000).default("") }));
    return decideReview(await db(), user!, vid, decision, note);
  },
  { auth: "required" },
);
