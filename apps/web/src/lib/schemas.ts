/** Validation shared by forms (client) and API routes (server). The server always re-validates. */
import { z } from "zod";
import { SPACE_CATEGORIES } from "@yielvy/core/world";

const SAFE_TEXT = /^[^<>]*$/; // plain text only; we never render user HTML

export const plainText = (max: number, min = 0) =>
  z
    .string()
    .trim()
    .min(min, min ? `Please write at least ${min} characters` : undefined)
    .max(max, `Keep it under ${max} characters`)
    .regex(SAFE_TEXT, "Angle brackets are not allowed");

export const httpUrl = z
  .string()
  .trim()
  .max(300)
  .url("Enter a full link starting with https://")
  .refine((u) => {
    try {
      const p = new URL(u);
      return (p.protocol === "https:" || p.protocol === "http:") && !p.username && !p.password;
    } catch {
      return false;
    }
  }, "Only http(s) links without credentials are allowed");

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "At least 3 characters")
  .max(40)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, numbers and dashes")
  .refine((s) => !RESERVED_SLUGS.has(s), "That name is reserved");

const RESERVED_SLUGS = new Set(["admin", "api", "yielvy", "organizer", "host", "signin", "me", "help", "support", "official", "team", "staff"]);

export const BUILDING_STYLE_IDS = ["workshop", "tower", "market", "atelier", "observatory", "pavilion"] as const;

export const spaceInput = z.object({
  organizationName: plainText(80, 2),
  name: plainText(60, 2),
  slug,
  category: z.enum(SPACE_CATEGORIES as [string, ...string[]]),
  tagline: plainText(120),
  description: plainText(2000),
  websiteUrl: httpUrl.optional().or(z.literal("").transform(() => undefined)),
  socials: z
    .object({ x: httpUrl.optional(), discord: httpUrl.optional(), telegram: httpUrl.optional(), github: httpUrl.optional() })
    .partial()
    .default({}),
  /** Legacy marker style id (kept for data compatibility; the 2D map derives markers from activity). */
  buildingStyle: z.enum(BUILDING_STYLE_IDS).default("workshop"),
});
export type SpaceInput = z.infer<typeof spaceInput>;

export const spaceUpdate = spaceInput.omit({ organizationName: true, slug: true, category: true }).extend({
  logoUploadId: z.string().uuid().nullable().optional(),
  bannerUploadId: z.string().uuid().nullable().optional(),
});

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40)
    .replace(/^-|-$/g, "");
}
