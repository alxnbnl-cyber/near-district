import { route } from "@/server/http";
import { db } from "@/server/db";
import { requireMyOrg } from "@/server/org";
import { withdrawOffering } from "@/server/partners";

type Ctx = { params: Promise<{ oid: string }> };

/** Withdraws an offering. Hints already using it follow their published withdrawal policy. */
export const DELETE = route<Ctx>(
  async (_req, { user, params }) => {
    const { oid } = await params;
    const database = await db();
    const { org } = await requireMyOrg(database, user!);
    await withdrawOffering(database, user!, org.id, oid);
    return { ok: true };
  },
  { auth: "required" },
);
