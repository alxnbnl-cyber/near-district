import { z } from "zod";
import { body, HttpError, route } from "@/server/http";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { nearRpc, token } from "@/server/near";
import { rateLimit } from "@/server/rate-limit";
import { buildClaimTransactions, confirmClaim } from "@/server/claims";

type Ctx = { params: Promise<{ id: string }> };

function vaultId(): string {
  const v = env().VAULT_CONTRACT_ID;
  if (!v) throw new HttpError(503, "Reward claims are not available on this deployment yet.", "vault_not_deployed");
  return v;
}

/** GET → transactions to sign. POST {txHash} → verify on-chain and record. */
export const GET = route<Ctx>(
  async (_req, { user, params }) => {
    const { id } = await params;
    const database = await db();
    await rateLimit(database, `claim-build:${user!.userId}`, 30, 600);
    return buildClaimTransactions(database, nearRpc(), vaultId(), token().contractId, user!, id);
  },
  { auth: "required" },
);

export const POST = route<Ctx>(
  async (req, { user, params }) => {
    const { id } = await params;
    const { txHash } = await body(req, z.object({ txHash: z.string().min(40).max(50) }));
    const database = await db();
    await rateLimit(database, `claim-confirm:${user!.userId}`, 30, 600);
    return confirmClaim(database, nearRpc(), vaultId(), user!, id, txHash);
  },
  { auth: "required" },
);
