import { route } from "@/server/http";
import { db } from "@/server/db";
import { getPlayState } from "@/server/play";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(
  async (_req, { user, params }) => {
    const { id } = await params;
    return getPlayState(await db(), user!, id);
  },
  { auth: "required" },
);
