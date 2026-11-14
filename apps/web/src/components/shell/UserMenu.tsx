"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui";
import { api } from "@/lib/api";

/** `avatar` replaces the default pill trigger (e.g. the game HUD profile badge). */
export function UserMenu({ user, avatar, dark = false }: { user: { displayName: string; isAdmin: boolean } | null; avatar?: React.ReactNode; dark?: boolean }) {
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
    if (avatar)
      return (
        <Link href="/signin?next=/explore" aria-label="Sign in" title="Sign in">
          {avatar}
        </Link>
      );
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
        aria-label={avatar ? `Account: ${user.displayName}` : undefined}
        className={avatar ? "block" : "flex h-9 items-center gap-2 rounded-full border border-line bg-card pl-1 pr-3 text-[13px] font-medium hover:border-line-strong"}
      >
        {avatar ?? (
          <>
        <span className="grid size-7 place-items-center rounded-full bg-orange font-display font-bold text-[#140c05]">{initial}</span>
        <span className="max-w-28 truncate">{user.displayName}</span>
          </>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className={`yv-enter absolute right-0 z-50 border p-1.5 shadow-pop ${dark ? "w-44 top-[calc(100%+8px)] border-[rgb(214_219_225/.16)] bg-[#06080bf2] backdrop-blur" : "w-56 top-11 rounded-lg border-line bg-card"}`}
        >
          {/* the game HUD menu is just "Sign out"; the site header keeps the full menu */}
          {!dark && [
            ["/me/rewards", "My rewards"],
            ["/me/profile", "Wallet & profile"],
            ["/organizer", "Host"],
            ...(user.isAdmin ? [["/admin", "Admin"]] : []),
          ].map(([href, label]) => (
            <Link key={href} role="menuitem" href={href!} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-[14px] hover:bg-paper-2">
              {label}
            </Link>
          ))}
          {!dark && <hr className="my-1 border-line" />}
          <button
            role="menuitem"
            type="button"
            className={
              dark
                ? "block w-full px-3 py-2.5 text-left font-mono text-[11.5px] font-bold uppercase tracking-[0.18em] text-[rgb(214_219_225/.8)] hover:bg-[rgb(255_255_255/.05)] hover:text-white"
                : "block w-full rounded-md px-3 py-2 text-left text-[14px] text-ink-2 hover:bg-paper-2"
            }
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
