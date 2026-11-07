"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, inputClass, Notice } from "@/components/ui";
import { WalletChooser } from "@/components/auth/WalletChooser";
import { api, ApiError } from "@/lib/api";

export function SignInForm({ next, emailAvailable }: { next: string; emailAvailable: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"email" | "wallet">(emailAvailable ? "email" : "wallet");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Sign in to Yielvy</h2>
      <div role="tablist" aria-label="Sign-in method" className="mt-4 grid grid-cols-2 rounded-md bg-paper-2 p-1">
        {(["email", "wallet"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            disabled={t === "email" && !emailAvailable}
            onClick={() => setTab(t)}
            className={`h-9 rounded-[8px] text-sm font-semibold ${tab === t ? "bg-card shadow-lift" : "text-ink-2"} disabled:opacity-40`}
          >
            {t === "email" ? "Email" : "NEAR wallet"}
          </button>
        ))}
      </div>

      <div className="mt-5" role="tabpanel">
        {tab === "email" ? (
          state === "sent" ? (
            <Notice tone="ok" title="Check your inbox">
              We sent a one-time link to <strong>{email}</strong>. It expires in 15 minutes.
            </Notice>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setState("sending");
                try {
                  await api("/api/auth/email/start", { method: "POST", body: { email } });
                  setState("sent");
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : "Could not send the link.");
                  setState("idle");
                }
              }}
            >
              <Field label="Email address" htmlFor="email" error={error}>
                <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              </Field>
              <Button type="submit" size="lg" disabled={state === "sending"}>
                {state === "sending" ? "Sending…" : "Email me a sign-in link"}
              </Button>
            </form>
          )
        ) : (
          <WalletChooser
            purpose="near_login"
            returnTo={next}
            onDone={() => {
              router.push(next);
              router.refresh();
            }}
          />
        )}
      </div>
    </Card>
  );
}
