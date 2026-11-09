import { z } from "zod";
import { body, forbidden, route } from "@/server/http";
import { db } from "@/server/db";
import { requireMyOrg } from "@/server/org";
import {
  addOwnChapter,
  expeditionDetail,
  inviteExpeditionPartner,
  publishExpedition,
  removeChapter,
  respondExpeditionInvite,
  setChapterOrder,
  setRewardChapter,
} from "@/server/expeditions";
import { slug } from "@/lib/schemas";

type Ctx = { params: Promise<{ eid: string }> };

export const GET = route<Ctx>(
  async (_req, { user, params }) => {
    const { eid } = await params;
    const database = await db();
    const { org } = await requireMyOrg(database, user!);
    const d = await expeditionDetail(database, eid);
    const involved = d.expedition.primaryOrgId === org.id || d.partners.some((p) => p.p.organizationId === org.id);
    if (!involved) throw forbidden();
    return { ...d, myOrgId: org.id };
  },
  { auth: "required" },
);

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add_chapter"), campaignId: z.string().uuid() }),
  z.object({ action: z.literal("remove_chapter"), campaignId: z.string().uuid() }),
  z.object({ action: z.literal("reorder"), campaignIds: z.array(z.string().uuid()).max(8) }),
  z.object({ action: z.literal("invite"), organizationSlug: slug }),
  z.object({ action: z.literal("respond"), decision: z.enum(["accept", "reject"]), campaignId: z.string().uuid().optional() }),
  z.object({ action: z.literal("set_reward"), campaignId: z.string().uuid().nullable() }),
  z.object({ action: z.literal("publish") }),
]);

export const POST = route<Ctx>(
  async (req, { user, params }) => {
    const { eid } = await params;
    const a = await body(req, action);
    const database = await db();
    const { org } = await requireMyOrg(database, user!);
    switch (a.action) {
      case "add_chapter":
        await addOwnChapter(database, user!, org.id, eid, a.campaignId);
        break;
      case "remove_chapter":
        await removeChapter(database, user!, org.id, eid, a.campaignId);
        break;
      case "reorder":
        await setChapterOrder(database, user!, org.id, eid, a.campaignIds);
        break;
      case "invite":
        await inviteExpeditionPartner(database, user!, org.id, eid, a.organizationSlug);
        break;
      case "respond":
        await respondExpeditionInvite(database, user!, org.id, eid, a.decision, a.campaignId);
        break;
      case "set_reward":
        await setRewardChapter(database, user!, org.id, eid, a.campaignId);
        break;
      case "publish":
        await publishExpedition(database, user!, org.id, eid);
        break;
    }
    return { ok: true };
  },
  { auth: "required" },
);
