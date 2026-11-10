import "server-only";
import type { Db } from "@yielvy/db";
import { myOrganization } from "./spaces";
import { forbidden } from "./http";
import type { SessionUser } from "./session";

/** The caller's organization (V1: one per organizer). Role checks happen in each service. */
export async function requireMyOrg(db: Db, user: SessionUser) {
  const mine = await myOrganization(db, user.userId);
  if (!mine?.org) throw forbidden("Open a vault first.");
  return mine;
}
