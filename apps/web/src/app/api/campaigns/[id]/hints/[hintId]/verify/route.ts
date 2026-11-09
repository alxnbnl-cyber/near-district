import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { verifyHintActivity } from "@/server/hints";
import { verifyInput } from "@/lib/hint-schemas";

type Ctx = { params: Promise<{ id: string; hintId: string }> };

/** Verify one requirement of a hint. The server derives every fact; the body is only a pointer. */
export const POST = route<Ctx>(
  async (req, { user, params }) => {
    const { id, hintId } = await params;
    return verifyHintActivity(await db(), user!, id, hintId, await body(req, verifyInput));
  },
  { auth: "required" },
);
