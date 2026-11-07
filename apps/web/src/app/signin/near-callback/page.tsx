"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Card, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

/** Return leg of browser-wallet (redirect) message signing. */
export default function NearCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const h = new URLSearchParams(window.location.hash.slice(1));
    const pending = JSON.parse(sessionStorage.getItem("yv_near_pending") ?? "null") as { nonce: string; returnTo: string } | null;
    history.replaceState(null, "", window.location.pathname);
    const accountId = h.get("accountId");
    const publicKey = h.get("publicKey");
    const signature = h.get("signature");
    const state = h.get("state");
    if (h.get("error") || !accountId || !publicKey || !signature) {
      setError("The wallet did not return a signature. Please try again.");
      return;
    }
    if (!pending || pending.nonce !== state) {
      setError("This signature does not match a request from this browser.");
      return;
    }
    api("/api/auth/near/verify", { method: "POST", body: { nonce: pending.nonce, accountId, publicKey, signature } })
      .then(() => {
        sessionStorage.removeItem("yv_near_pending");
        router.replace(pending.returnTo.startsWith("/") ? pending.returnTo : "/");
        router.refresh();
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Verification failed."));
  }, [router]);

  return (
    <main className="mx-auto max-w-md px-4 py-20">
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Confirming your wallet</h1>
        {error ? <div className="mt-4"><Notice tone="danger">{error}</Notice></div> : <p className="mt-3 text-sm text-ink-2">One moment…</p>}
      </Card>
    </main>
  );
}
