"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Key {
  keyId: string;
  label: string;
  createdAt: string;
  revoked: boolean;
}

/** App events: keys the company's backend uses to confirm player actions (sign-ups, purchases…) to Yielvy. */
export function AppKeysPanel({ appUrl }: { appUrl: string }) {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<{ keyId: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ keys: Key[] }>("/api/organizer/app-keys").then((r) => setKeys(r.keys)).catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load keys."));
  }, []);
  useEffect(load, [load]);

  const example = `const body = JSON.stringify({ code: "YV-XXXXXX", eventType: "signed_up", eventId: "user-123" });
const ts = Math.floor(Date.now() / 1000).toString();
const sig = crypto.createHmac("sha256", SECRET).update(ts + "." + body).digest("hex");
await fetch("${appUrl}/api/partner/events", {
  method: "POST",
  headers: { "content-type": "application/json", "x-yielvy-key": KEY_ID, "x-yielvy-timestamp": ts, "x-yielvy-signature": sig },
  body,
});`;

  return (
    <Card className="flex flex-col gap-4 p-5 text-sm">
      <p className="text-ink-2">
        Let players unlock hints by doing something in <em>your</em> app. Players get a code like <code>YV-7K3P9Q</code> on the hint and enter it in your app; your backend then sends a signed event.
      </p>
      {keys && keys.filter((k) => !k.revoked).length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line">
          {keys.filter((k) => !k.revoked).map((k) => (
            <li key={k.keyId} className="flex items-center gap-3 px-3 py-2">
              <span className="flex-1 font-mono text-[12.5px]">{k.keyId}</span>
              <span className="text-ink-3">{k.label}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await api("/api/organizer/app-keys", { method: "DELETE", body: { keyId: k.keyId } }).catch(() => undefined);
                  load();
                }}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
      {fresh && (
        <div className="rounded-md border border-gold/50 bg-gold-wash/40 p-3">
          <p className="font-semibold">Copy the secret now. It won&apos;t be shown again.</p>
          <p className="mt-1 font-mono text-[12.5px]">Key: {fresh.keyId}</p>
          <p className="select-all font-mono text-[12.5px]">Secret: {fresh.secret}</p>
        </div>
      )}
      <div className="flex gap-2">
        <input className={`${inputClass} max-w-xs`} placeholder="Label (e.g. production)" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        <Button
          size="md"
          onClick={async () => {
            setError(null);
            try {
              setFresh(await api("/api/organizer/app-keys", { method: "POST", body: { label } }));
              setLabel("");
              load();
            } catch (e) {
              setError(e instanceof ApiError ? e.message : "Couldn't create a key.");
            }
          }}
        >
          Create key
        </Button>
      </div>
      {error && <p className="text-danger">{error}</p>}
      <details>
        <summary className="cursor-pointer font-medium">How to send an event (Node.js)</summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-paper-2 p-3 text-[12px] leading-relaxed">{example}</pre>
      </details>
    </Card>
  );
}
