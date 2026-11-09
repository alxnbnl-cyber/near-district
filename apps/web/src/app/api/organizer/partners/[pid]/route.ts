import { z } from "zod";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { requireMyOrg } from "@/server/org";
import { actOnPartnership } from "@/server/partners";

type Ctx = { params: Promise<{ pid: string }> };

export const POST = route<Ctx>(
  async (req, { user, params }) => {
    const { pid } = await params;
    const { action } = await body(req, z.object({ action: z.enum(["accept", "reject", "cancel"]) }));
    const database = await db();
    const { org } = await requireMyOrg(database, user!);
    return actOnPartnership(database, user!, org.id, pid, action);
  },
  { auth: "required" },
);
