"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export function AdminAction({ kind, id, actions, needReason = false }: { kind: string; id: string; actions: [string, string][]; needReason?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {actions.map(([decision, label], i) => (
          <Button
            key={decision}
            size="sm"
            variant={i === 0 ? "primary" : "secondary"}
            disabled={busy}
            onClick={async () => {
              const reason = needReason ? prompt("Reason (recorded in the audit log)") : "";
              if (needReason && !reason) return;
              setBusy(true);
              setError(null);
              try {
                await api("/api/admin/action", { method: "POST", body: { kind, id, decision, reason: reason ?? "" } });
                router.refresh();
              } catch (e) {
                setError(e instanceof ApiError ? e.message : "Failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}
