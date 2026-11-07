/**
 * Yielvy background worker. Runs as its own process (Railway service / Docker container).
 * Financial workflows NEVER depend on a browser tab or a web request staying alive.
 *
 *   DATABASE_URL, NEAR_NETWORK, NEAR_RPC_URLS              required
 *   VAULT_CONTRACT_ID                                      optional (vault jobs no-op without it)
 *   OPERATOR_ACCOUNT_ID, OPERATOR_PRIVATE_KEY              optional (on-chain steps pause without it)
 *   ONE_CLICK_JWT, WORKER_CONCURRENCY, HEALTH_PORT         optional
 */
import { createServer } from "node:http";
import { hostname } from "node:os";
import { createDb } from "@yielvy/db";
import { getNetwork, primaryToken } from "@yielvy/core";
import { NearRpc, OneClickClient, RheaClient, VaultClient } from "@yielvy/near";
import { claim, complete, enqueue, fail, reschedule, RetryLater } from "./queue";
import { HANDLERS, SCHEDULE, type JobCtx } from "./jobs";
import { createOperatorSigner, OperatorNotConfigured } from "./operator";

const log = (level: string, msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }));

const env = process.env;
for (const k of ["DATABASE_URL", "NEAR_NETWORK", "NEAR_RPC_URLS"]) if (!env[k]) throw new Error(`${k} is required`);

const workerId = `${hostname()}:${process.pid}`;
const { db, close } = await createDb(env.DATABASE_URL!, { max: 5 });
const net = getNetwork(env.NEAR_NETWORK);
const rpc = new NearRpc({ urls: env.NEAR_RPC_URLS!.split(",").map((s) => s.trim()) });
const signer = await createOperatorSigner(env);
const ctx: JobCtx = {
  db,
  rpc,
  vault: env.VAULT_CONTRACT_ID ? new VaultClient(rpc, env.VAULT_CONTRACT_ID) : null,
  rhea: new RheaClient(rpc, net.rheaLendingContract),
  oneClick: new OneClickClient({ jwt: env.ONE_CLICK_JWT }),
  signer,
  token: primaryToken(net),
  network: net.networkId,
};
log("info", "worker starting", { workerId, network: net.networkId, vault: env.VAULT_CONTRACT_ID ?? null, operator: signer?.accountId ?? null });

let stopping = false;
let lastLoop = Date.now();
const concurrency = Number(env.WORKER_CONCURRENCY ?? 4);

async function scheduleTick() {
  const now = Date.now();
  for (const [name, every] of SCHEDULE) {
    const bucket = Math.floor(now / (every * 1000));
    await enqueue(db, name, {}, { idempotencyKey: `${name}:${bucket}`, maxAttempts: 3 });
  }
}

async function runJob(job: Awaited<ReturnType<typeof claim>>[number]) {
  const handler = HANDLERS[job.name];
  const started = Date.now();
  if (!handler) {
    await fail(db, { ...job, attempts: job.maxAttempts }, new Error(`unknown job ${job.name}`));
    return;
  }
  try {
    const result = await handler(ctx, job.payload);
    await complete(db, job.id);
    log("info", "job done", { job: job.name, id: job.id, ms: Date.now() - started, result });
  } catch (e) {
    if (e instanceof RetryLater) {
      await reschedule(db, job, e.seconds, e.message);
      log("debug", "job waiting", { job: job.name, id: job.id, seconds: e.seconds, reason: e.message });
      return;
    }
    if (e instanceof OperatorNotConfigured) {
      await reschedule(db, job, 3600, e.message);
      log("warn", "operator not configured", { job: job.name, id: job.id });
      return;
    }
    const outcome = await fail(db, job, e);
    log(outcome === "dead" ? "error" : "warn", "job failed", { job: job.name, id: job.id, attempt: job.attempts, outcome, err: String(e) });
  }
}

async function loop() {
  let lastSchedule = 0;
  while (!stopping) {
    lastLoop = Date.now();
    try {
      if (Date.now() - lastSchedule > 10_000) {
        await scheduleTick();
        lastSchedule = Date.now();
      }
      const batch = await claim(db, workerId, concurrency);
      if (batch.length === 0) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      await Promise.all(batch.map(runJob));
    } catch (e) {
      log("error", "worker loop error (database unreachable?)", { err: String(e) });
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// Health endpoint for the platform: unhealthy if the loop stalls for 60s.
const health = createServer((_req, res) => {
  const ok = Date.now() - lastLoop < 60_000;
  res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok, workerId, lastLoopMsAgo: Date.now() - lastLoop }));
});
health.listen(Number(env.HEALTH_PORT ?? 8081));

const shutdown = async (sig: string) => {
  log("info", "shutting down", { sig });
  stopping = true;
  health.close();
  setTimeout(async () => {
    await close();
    process.exit(0);
  }, 3000);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await loop();
