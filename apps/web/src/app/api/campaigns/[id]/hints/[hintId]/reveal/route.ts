import { route } from "@/server/http";
import { db } from "@/server/db";
import { revealHint } from "@/server/hints";

type Ctx = { params: Promise<{ id: string; hintId: string }> };

export const POST = route<Ctx>(
  async (_req, { user, params }) => {
    const { id, hintId } = await params;
    return revealHint(await db(), user!, id, hintId);
  },
  { auth: "required" },
);
