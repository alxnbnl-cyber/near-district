import { badRequest, route } from "@/server/http";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { storeImage, UPLOAD_LIMITS } from "@/server/uploads";
import { myOrganization } from "@/server/spaces";

export const POST = route(
  async (req, { user }) => {
    const database = await db();
    await rateLimit(database, `upload:${user!.userId}`, 30, 3600);
    const form = await req.formData();
    const purpose = String(form.get("purpose") ?? "");
    const file = form.get("file");
    if (!(purpose in UPLOAD_LIMITS)) throw badRequest("Unknown upload type.");
    if (!(file instanceof File)) throw badRequest("Attach an image file.");
    if (file.size > 5_000_000) throw badRequest("That file is too large.");
    const orgPurposes = ["logo", "banner", "cover", "question_image"];
    const org = orgPurposes.includes(purpose) ? await myOrganization(database, user!.userId) : null;
    if (orgPurposes.includes(purpose) && !org) throw badRequest("Create your company profile before uploading images.");
    return storeImage(database, {
      userId: user!.userId,
      organizationId: org?.org.id ?? null,
      purpose: purpose as keyof typeof UPLOAD_LIMITS,
      data: Buffer.from(await file.arrayBuffer()),
    });
  },
  { auth: "required" },
);
