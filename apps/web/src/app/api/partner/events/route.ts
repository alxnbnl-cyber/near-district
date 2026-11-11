import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { HttpError } from "@/server/http";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { ingestPartnerEvent } from "@/server/partner-events";

/**
 * Server-to-server endpoint for company apps. Authenticated by HMAC signature (no cookies, no CSRF).
 * Headers: x-yielvy-key, x-yielvy-timestamp (unix seconds), x-yielvy-signature = hex HMAC-SHA256(secret, `${timestamp}.${body}`)
 * Body: { "code": "YV-XXXXXX", "eventType": "signed_up", "eventId": "your-unique-id" }
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > 4096) throw new HttpError(413, "Request too large.");
    const database = await db();
    await rateLimit(database, `partner-events:${req.headers.get("x-yielvy-key") ?? "anon"}`, 600, 60);
    return NextResponse.json(await ingestPartnerEvent(database, req.headers, raw));
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    return NextResponse.json({ error: "Something went wrong on our side.", code: "internal" }, { status: 500 });
  }
}
