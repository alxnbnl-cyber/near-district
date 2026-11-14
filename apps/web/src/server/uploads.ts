import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { uploads, type Db } from "@near-district/db";
import { env } from "./env";
import { sha256Hex } from "./crypto";
import { badRequest } from "./http";

/**
 * Image uploads: type is decided by MAGIC BYTES (never by filename or client MIME), size is
 * capped, dimensions are read from the header and bounded, and files are stored under random
 * keys outside the web root. SVG is rejected (it can carry script). Served with nosniff and a
 * sandbox CSP. A storage adapter boundary allows swapping local disk for S3/R2.
 */
export const UPLOAD_LIMITS: Record<string, { maxBytes: number; maxDim: number }> = {
  logo: { maxBytes: 1_000_000, maxDim: 2048 },
  banner: { maxBytes: 3_000_000, maxDim: 4096 },
  cover: { maxBytes: 3_000_000, maxDim: 4096 },
  question_image: { maxBytes: 2_000_000, maxDim: 4096 },
  submission_image: { maxBytes: 3_000_000, maxDim: 4096 },
};

type Kind = { mime: "image/png" | "image/jpeg" | "image/webp"; ext: string };

export function sniffImage(buf: Buffer): Kind | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

export function imageSize(buf: Buffer, mime: Kind["mime"]): { width: number; height: number } | null {
  try {
    if (mime === "image/png") return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (mime === "image/webp") {
      const chunk = buf.subarray(12, 16).toString("ascii");
      if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
    // JPEG: walk segments to the SOFn marker
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1]!;
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  } catch {
    return null;
  }
}

export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export const localStorageAdapter: StorageAdapter = {
  async put(key, data) {
    const dir = path.resolve(env().UPLOAD_DIR);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, path.basename(key)), data, { flag: "wx" });
  },
  async get(key) {
    return readFile(path.join(path.resolve(env().UPLOAD_DIR), path.basename(key)));
  },
};

export async function storeImage(
  db: Db,
  opts: { userId: string; organizationId: string | null; purpose: keyof typeof UPLOAD_LIMITS; data: Buffer },
  storage: StorageAdapter = localStorageAdapter,
) {
  const limits = UPLOAD_LIMITS[opts.purpose];
  if (!limits) throw badRequest("Unknown upload type.");
  if (opts.data.length === 0) throw badRequest("The file is empty.");
  if (opts.data.length > limits.maxBytes) throw badRequest(`Images for this spot must be under ${Math.round(limits.maxBytes / 1_000_000)} MB.`);
  const kind = sniffImage(opts.data);
  if (!kind) throw badRequest("Please upload a PNG, JPEG or WebP image.");
  const dims = imageSize(opts.data, kind.mime);
  if (!dims || dims.width < 16 || dims.height < 16) throw badRequest("We couldn't read that image's size.");
  if (dims.width > limits.maxDim || dims.height > limits.maxDim) throw badRequest(`Images can be at most ${limits.maxDim}px on each side.`);
  const key = `${randomUUID()}.${kind.ext}`;
  await storage.put(key, opts.data);
  const [row] = await db
    .insert(uploads)
    .values({
      ownerUserId: opts.userId,
      organizationId: opts.organizationId,
      purpose: opts.purpose,
      storageKey: key,
      mimeType: kind.mime,
      byteSize: opts.data.length,
      width: dims.width,
      height: dims.height,
      sha256: sha256Hex(opts.data),
      moderation: "approved",
    })
    .returning({ id: uploads.id });
  return { id: row!.id, url: `/api/uploads/${row!.id}`, ...dims };
}
