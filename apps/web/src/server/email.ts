import "server-only";
import { env } from "./env";

/**
 * Transactional email. Production uses Resend's HTTP API (RESEND_API_KEY + EMAIL_FROM).
 * In development without a key, the message is printed to the server log so sign-in can
 * be tested locally. In production without a key, email sign-in is disabled.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const e = env();
  if (e.RESEND_API_KEY && e.EMAIL_FROM) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: e.EMAIL_FROM, to, subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Email provider error ${res.status}`);
    return;
  }
  if (e.NODE_ENV === "production") throw new Error("Email is not configured");
  console.log(`\n[dev email] to=${to}\nsubject: ${subject}\n${text}\n`);
}
