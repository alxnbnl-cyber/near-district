import { route } from "@/server/http";
import { revokeCurrentSession } from "@/server/session";

export const POST = route(async () => {
  await revokeCurrentSession();
  return { ok: true };
});
