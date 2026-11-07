import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "./env";
import { getSessionUser, type SessionUser } from "./session";
import { RateLimitError } from "./rate-limit";

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message);
  }
}

export const forbidden = (msg = "You do not have permission to do that.") => new HttpError(403, msg, "forbidden");
export const notFound = (msg = "Not found.") => new HttpError(404, msg, "not_found");
export const badRequest = (msg: string, code = "bad_request") => new HttpError(400, msg, code);
export const conflict = (msg: string, code = "conflict") => new HttpError(409, msg, code);

/**
 * CSRF defence for cookie-authenticated mutations: the Origin (or, failing that, the
 * Referer) must be our own origin, and fetch metadata must not be cross-site.
 * Combined with SameSite=Lax session cookies.
 */
export function assertSameOrigin(req: NextRequest): void {
  const expected = new URL(env().APP_URL).origin;
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw forbidden("Cross-site request blocked.");
  if (origin) {
    if (origin !== expected) throw forbidden("Cross-origin request blocked.");
    return;
  }
  const referer = req.headers.get("referer");
  if (!referer || new URL(referer).origin !== expected) throw forbidden("Missing request origin.");
}

type Handler<C> = (req: NextRequest, ctx: C & { user: SessionUser | null }) => Promise<unknown>;

/** Wraps a route handler: CSRF on mutations, auth loading, uniform JSON errors. */
export function route<C = { params: Promise<Record<string, string>> }>(
  handler: Handler<C>,
  opts: { auth?: "required" | "optional"; csrf?: boolean } = {},
) {
  return async (req: NextRequest, ctx: C) => {
    try {
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (mutating && opts.csrf !== false) assertSameOrigin(req);
      const user = await getSessionUser();
      if (opts.auth === "required" && !user) throw new HttpError(401, "Please sign in first.", "unauthenticated");
      if (user?.status === "suspended" && mutating) throw forbidden("This account is suspended.");
      const result = await handler(req, { ...ctx, user });
      if (result instanceof Response) return result;
      return NextResponse.json(serialize(result ?? { ok: true }));
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      if (e instanceof RateLimitError) {
        return NextResponse.json({ error: e.message, code: "rate_limited" }, { status: 429, headers: { "retry-after": String(e.retryAfterSeconds) } });
      }
      if (e instanceof z.ZodError) {
        return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid input", code: "validation", issues: e.issues }, { status: 400 });
      }
      console.error(JSON.stringify({ level: "error", msg: "unhandled route error", path: req.nextUrl.pathname, err: String(e), stack: (e as Error)?.stack }));
      return NextResponse.json({ error: "Something went wrong on our side.", code: "internal" }, { status: 500 });
    }
  };
}

export async function body<T extends z.ZodTypeAny>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > 256 * 1024) throw new HttpError(413, "Request too large.");
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw badRequest("Expected a JSON body.");
  }
  return schema.parse(json);
}

/** bigint -> string for JSON responses. Money is always transmitted as integer strings. */
export function serialize(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
}
