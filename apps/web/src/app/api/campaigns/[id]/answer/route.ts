import { z } from "zod";
import { body, route } from "@/server/http";
import { db } from "@/server/db";
import { ipHash } from "@/server/crypto";
import { clientIp } from "@/server/session";
import { submitAnswer } from "@/server/play";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(
  async (req, { user, params }) => {
    const { id } = await params;
    const { questionId, answer } = await body(req, z.object({ questionId: z.string().uuid(), answer: z.string().max(500) }));
    return submitAnswer(await db(), user!, id, questionId, answer, ipHash(await clientIp()));
  },
  { auth: "required" },
);
