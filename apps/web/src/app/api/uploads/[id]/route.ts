import { NextResponse, type NextRequest } from "next/server";
import { eq, uploads } from "@near-district/db";
import { db } from "@/server/db";
import { localStorageAdapter } from "@/server/uploads";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const database = await db();
  const [u] = await database.select().from(uploads).where(eq(uploads.id, id)).limit(1);
  if (!u || u.moderation === "rejected" || u.moderation === "suspended") return new NextResponse("Not found", { status: 404 });
  // demo logos seeded on hosted deployments point at files bundled in /public (no shared disk needed)
  // relative Location: behind a proxy the request URL can be the internal address (e.g. https://localhost:8080)
  if (u.storageKey.startsWith("static:/assets/")) return new NextResponse(null, { status: 308, headers: { location: u.storageKey.slice("static:".length) } });
  const data = await localStorageAdapter.get(u.storageKey);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": u.mimeType,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "public, max-age=31536000, immutable",
      "content-disposition": "inline",
    },
  });
}
