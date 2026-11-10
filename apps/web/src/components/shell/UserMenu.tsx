"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui";
import { api } from "@/lib/api";

export function UserMenu({ user }: { user: { displayName: string; isAdmin: boolean } | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!user) {
    return (
      <Link href="/signin" className={buttonClass("dark", "sm")}>
        Sign in
      </Link>
    );
  }
  const initial = user.displayName.slice(0, 1).toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-full border border-line bg-card pl-1 pr-3 text-[13px] font-medium hover:border-line-strong"
      >
        <span className="grid size-7 place-items-center rounded-full bg-orange font-display font-bold text-[#140c05]">{initial}</span>
        <span className="max-w-28 truncate">{user.displayName}</span>
      </button>
      {open && (
        <div role="menu" className="yv-enter absolute right-0 top-11 w-56 rounded-lg border border-line bg-card p-1.5 shadow-pop">
          {[
            ["/me/rewards", "My rewards"],
            ["/me/profile", "Wallet & profile"],
            ["/organizer", "My vault"],
            ...(user.isAdmin ? [["/admin", "Admin"]] : []),
          ].map(([href, label]) => (
            <Link key={href} role="menuitem" href={href!} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-[14px] hover:bg-paper-2">
              {label}
            </Link>
          ))}
          <hr className="my-1 border-line" />
          <button
            role="menuitem"
            type="button"
            className="block w-full rounded-md px-3 py-2 text-left text-[14px] text-ink-2 hover:bg-paper-2"
            onClick={async () => {
              await api("/api/auth/signout", { method: "POST" });
              router.push("/");
              router.refresh();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
