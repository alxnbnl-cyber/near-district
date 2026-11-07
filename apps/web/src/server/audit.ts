import "server-only";
import { auditLogs, type Db, type Tx } from "@yielvy/db";

export async function audit(
  db: Db | Tx,
  entry: { actorUserId: string | null; action: string; targetType?: string; targetId?: string; metadata?: Record<string, unknown>; ipHash?: string | null },
): Promise<void> {
  await db.insert(auditLogs).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
    ipHash: entry.ipHash ?? null,
  });
}
