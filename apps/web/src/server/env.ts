import "server-only";
import { z } from "zod";

const hex32 = z.string().regex(/^[0-9a-f]{64}$/i, "must be 32 bytes hex");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  NEAR_NETWORK: z.enum(["mainnet", "testnet"]),
  NEAR_RPC_URLS: z.string().min(1),
  /** Vault contract account. Unset => funding features show an honest "not deployed" state. */
  VAULT_CONTRACT_ID: z.string().optional().transform((v) => (v ? v : undefined)),
  /** HMAC pepper for answer digests and analytics hashing. */
  ANSWER_PEPPER: z.string().min(32),
  /** AES-256-GCM key (hex) for answer rules at rest. */
  ANSWER_ENCRYPTION_KEY: hex32,
  IP_HASH_SALT: z.string().min(16),
  UPLOAD_DIR: z.string().default("./.data/uploads"),
  EMAIL_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  ONE_CLICK_JWT: z.string().optional(),
  /** ISO country codes where random-draw rewards may be offered (comma separated). Empty = nowhere. */
  RANDOM_DRAW_ALLOWED_COUNTRIES: z.string().default(""),
  /** Header carrying the visitor country from the CDN (e.g. cf-ipcountry). */
  COUNTRY_HEADER: z.string().default("cf-ipcountry"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Invalid server environment:\n  ${issues}`);
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.APP_URL.startsWith("https://")) {
    throw new Error("APP_URL must be https in production");
  }
  cached = parsed.data;
  return cached;
}

export function emailEnabled(): boolean {
  const e = env();
  return Boolean(e.RESEND_API_KEY && e.EMAIL_FROM) || e.NODE_ENV !== "production";
}
