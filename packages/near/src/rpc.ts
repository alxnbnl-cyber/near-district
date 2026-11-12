/**
 * Minimal NEAR JSON-RPC client. Read paths only use `final` finality so the app never
 * acts on a block that could still be reorganized.
 */
export class RpcError extends Error {
  constructor(message: string, readonly data?: unknown, readonly retryable = false) {
    super(message);
  }
}

export interface RpcOptions {
  urls: string[]; // primary first, then fallbacks
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class NearRpc {
  private readonly urls: string[];
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private nextId = 1;

  constructor(opts: RpcOptions) {
    if (opts.urls.length === 0) throw new Error("At least one RPC URL is required");
    this.urls = opts.urls;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async call<T>(method: string, params: unknown): Promise<T> {
    let lastErr: unknown;
    for (const url of this.urls) {
      try {
        const res = await this.fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (res.status === 429 || res.status >= 500) throw new RpcError(`RPC HTTP ${res.status}`, undefined, true);
        const body = (await res.json()) as { result?: T & { error?: string }; error?: { message?: string; data?: unknown; cause?: { name?: string } } };
        if (body.error) {
          const name = body.error.cause?.name ?? "";
          throw new RpcError(`${body.error.message ?? "RPC error"} ${name}`.trim(), body.error.data ?? body.error, /TIMEOUT|UNAVAILABLE/.test(name));
        }
        // view-call contract panics come back inside result.error
        if (body.result && typeof body.result === "object" && "error" in body.result && body.result.error) {
          throw new RpcError(String(body.result.error));
        }
        return body.result as T;
      } catch (e) {
        lastErr = e;
        if (e instanceof RpcError && !e.retryable) throw e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new RpcError("All RPC endpoints failed", lastErr, true);
  }

  async view<T>(contractId: string, methodName: string, args: object = {}): Promise<T> {
    const r = await this.call<{ result: number[]; block_height: number }>("query", {
      request_type: "call_function",
      finality: "final",
      account_id: contractId,
      method_name: methodName,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    });
    const text = Buffer.from(r.result).toString("utf8");
    return (text.length ? JSON.parse(text) : null) as T;
  }

  async viewAccessKey(accountId: string, publicKey: string): Promise<{ permission: "FullAccess" | { FunctionCall: unknown } } | null> {
    try {
      return await this.call("query", { request_type: "view_access_key", finality: "final", account_id: accountId, public_key: publicKey });
    } catch (e) {
      if (e instanceof RpcError && /does not exist|UNKNOWN_ACCESS_KEY|UNKNOWN_ACCOUNT/i.test(e.message + JSON.stringify(e.data ?? ""))) return null;
      throw e;
    }
  }

  async accountExists(accountId: string): Promise<boolean> {
    try {
      await this.call("query", { request_type: "view_account", finality: "final", account_id: accountId });
      return true;
    } catch (e) {
      if (e instanceof RpcError && /UNKNOWN_ACCOUNT|does not exist/i.test(e.message + JSON.stringify(e.data ?? ""))) return false;
      throw e;
    }
  }

  /**
   * Final transaction outcome including all receipts. `wait_until: FINAL` makes the node
   * return only once every receipt (also detached ones) has executed in a final block.
   */
  async txStatus(txHash: string, senderId: string): Promise<TxOutcome> {
    return this.call<TxOutcome>("tx", { tx_hash: txHash, sender_account_id: senderId, wait_until: "FINAL" });
  }

  async finalBlockHeight(): Promise<number> {
    const b = await this.call<{ header: { height: number } }>("block", { finality: "final" });
    return b.header.height;
  }
}

export interface ReceiptOutcome {
  id: string;
  block_hash: string;
  outcome: {
    logs: string[];
    executor_id: string;
    receipt_ids?: string[];
    status: { SuccessValue?: string; SuccessReceiptId?: string; Failure?: unknown };
  };
}

export interface TxOutcome {
  final_execution_status?: string;
  status: { SuccessValue?: string; Failure?: unknown };
  transaction: { hash: string; signer_id: string; receiver_id: string; actions: unknown[] };
  transaction_outcome: ReceiptOutcome;
  receipts_outcome: ReceiptOutcome[];
}

/** Top-level outcome succeeded. Individual receipts may still have failed — see failedReceipts. */
export function txSucceeded(o: TxOutcome): boolean {
  return o.status.SuccessValue !== undefined && o.status.Failure === undefined;
}

export function failedReceipts(o: TxOutcome): ReceiptOutcome[] {
  return o.receipts_outcome.filter((r) => r.outcome.status.Failure !== undefined);
}

export function allLogs(o: TxOutcome): { receiptId: string; executor: string; index: number; log: string }[] {
  return o.receipts_outcome.flatMap((r) => r.outcome.logs.map((log, index) => ({ receiptId: r.id, executor: r.outcome.executor_id, index, log })));
}

export function successValueJson<T>(o: TxOutcome): T | null {
  const v = o.status.SuccessValue;
  if (v === undefined || v === "") return null;
  return JSON.parse(Buffer.from(v, "base64").toString("utf8")) as T;
}

export function rpcFromEnv(env: Record<string, string | undefined> = process.env): NearRpc {
  const urls = (env.NEAR_RPC_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (urls.length === 0) throw new Error("NEAR_RPC_URLS is not configured");
  return new NearRpc({ urls });
}
