"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

/** The token arrives in the URL fragment (never sent to servers or logs) and is only used on an explicit click. */
export default function VerifyEmailPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const read = useRef(false);

  useEffect(() => {
    // Run once (dev StrictMode double-invokes effects), then scrub the token from the URL.
    if (read.current) return;
    read.current = true;
    const t = new URLSearchParams(window.location.hash.slice(1)).get("token");
    setToken(t);
    if (t) history.replaceState(null, "", window.location.pathname);
  }, []);

  return (
    <main className="mx-auto max-w-md px-4 py-20">
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Finish signing in</h1>
        {!token ? (
          <p className="mt-3 text-sm text-ink-2">This link is incomplete. Please request a new sign-in link.</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-ink-2">Press continue to sign in on this device.</p>
            <Button
              className="mt-5 w-full"
              size="lg"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await api("/api/auth/email/verify", { method: "POST", body: { token } });
                  router.push("/");
                  router.refresh();
                } catch (e) {
                  setError(e instanceof ApiError ? e.message : "Sign-in failed.");
                  setBusy(false);
                }
              }}
            >
              Continue
            </Button>
          </>
        )}
        {error && (
          <div className="mt-4">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
      </Card>
    </main>
  );
}
