import { NextResponse } from "next/server";
import { sql } from "@near-district/db";
import { db } from "@/server/db";

/** Liveness + database reachability. Never exposes configuration or secrets. */
export async function GET() {
  try {
    const database = await db();
    await database.execute(sql`select 1`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
