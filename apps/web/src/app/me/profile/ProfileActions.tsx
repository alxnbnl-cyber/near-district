"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { WalletChooser } from "@/components/auth/WalletChooser";
import { api } from "@/lib/api";

export function LinkWallet({ network }: { network: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>Link a NEAR wallet ({network})</Button>;
  return (
    <div className="max-w-sm">
      <WalletChooser purpose="link_wallet" returnTo="/me/profile" onDone={() => { setOpen(false); router.refresh(); }} intro="Sign a free message to prove you own the account." />
    </div>
  );
}

export function RevokeSessions() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        if (!confirm("Sign out everywhere, including this device?")) return;
        await api("/api/auth/sessions", { method: "DELETE" });
        router.push("/signin");
        router.refresh();
      }}
    >
      Sign out of all devices
    </Button>
  );
}
