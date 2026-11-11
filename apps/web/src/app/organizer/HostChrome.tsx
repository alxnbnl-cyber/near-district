"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GameIcon, type GameIconName } from "@/components/host/GameIcon";
import { frame } from "@/components/explore/frame";

const INK = "rgb(214 219 225";
export const HOST_FROM_KEY = "yv.hostFrom";

/** Remember where the host console was opened from, so "Back" returns there. */
export function rememberHostOrigin(from: "map" | "home") {
  try {
    sessionStorage.setItem(HOST_FROM_KEY, from);
  } catch {
    /* ignore */
  }
}

/** "← Back to map" when the player came from the map, otherwise back to the homepage. */
export function BackLink() {
  const [to, setTo] = useState<"map" | "home" | null>(null);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("from");
      if (q === "map" || q === "home") sessionStorage.setItem(HOST_FROM_KEY, q);
      setTo(sessionStorage.getItem(HOST_FROM_KEY) === "map" ? "map" : "home");
    } catch {
      setTo("home");
    }
  }, []);
  return (
    <Link
      href={to === "map" ? "/explore" : "/"}
      className="group flex h-10 items-center gap-2 bg-[rgb(5_7_10/.7)] px-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.75)] backdrop-blur transition-colors hover:text-white"
      style={frame(9, `${INK} / .2)`)}
    >
      <span aria-hidden className="transition-transform group-hover:-translate-x-0.5">←</span>
      {to ? `Back to ${to}` : "Back"}
    </Link>
  );
}

type NavItem = { href: string; label: string; icon: GameIconName | "guide"; locked?: boolean };

/** Sidebar: guide order first (profile → funding → missions → cooperation), then extras. */
export function OwnerNav({ hasSpace, approved }: { hasSpace: boolean; approved: boolean }) {
  const path = usePathname() ?? "";
  const lockedWork = !hasSpace || !approved;
  const main: NavItem[] = [
    { href: "/organizer", label: "Overview", icon: "explore" },
    { href: hasSpace ? "/organizer/space" : "/organizer", label: "Company profile", icon: "profile" },
    { href: "/organizer/funding", label: "Funding", icon: "earn", locked: lockedWork },
    { href: "/organizer/campaigns", label: "Missions", icon: "host", locked: lockedWork },
    { href: "/organizer/how-it-works", label: "How it works", icon: "guide" },
  ];
  const extra: NavItem[] = hasSpace
    ? [
        { href: "/organizer/reviews", label: "Reviews", icon: "guide", locked: lockedWork },
        { href: "/organizer/settings", label: "Settings", icon: "guide" },
      ]
    : [];
  const isActive = (href: string, label: string) =>
    label === "Company profile" && !hasSpace ? false : href === "/organizer" ? path === "/organizer" : path.startsWith(href);

  return (
    <nav aria-label="Host console">
      <ul className="flex gap-1.5 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
        {main.map((it) => {
          const active = isActive(it.href, it.label);
          const body = (
            <>
              <span className="flex-1 whitespace-nowrap text-[14.5px] font-medium">{it.label}</span>
              {it.locked && (
                <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" className="shrink-0 opacity-70">
                  <rect x="5" y="11" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              )}
            </>
          );
          const cls = "flex items-center gap-2.5 px-3.5 py-2.5 transition-colors";
          return (
            <li key={it.label}>
              {it.locked ? (
                <span aria-disabled="true" title="Unlocks once your company profile is approved" className={`${cls} cursor-not-allowed text-[rgb(214_219_225/.35)]`}>
                  {body}
                </span>
              ) : (
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={`${cls} ${active ? "bg-[rgb(255_145_56/.12)] text-orange" : "text-[rgb(214_219_225/.75)] hover:bg-[rgb(255_255_255/.04)] hover:text-white"}`}
                  style={active ? frame(8, "rgb(255 145 56 / .55)") : undefined}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {extra.length > 0 && (
        <ul className="mt-4 hidden gap-0.5 border-t border-[rgb(255_255_255/.08)] pt-3 md:flex md:flex-col">
          {extra.map((it) => (
            <li key={it.label}>
              {it.locked ? (
                <span className="block px-3.5 py-1.5 text-[13px] text-[rgb(214_219_225/.3)]">{it.label}</span>
              ) : (
                <Link
                  href={it.href}
                  className={`block px-3.5 py-1.5 text-[13px] transition-colors ${path.startsWith(it.href) ? "text-orange" : "text-[rgb(214_219_225/.5)] hover:text-white"}`}
                >
                  {it.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

const LOCKED_PATHS = ["/organizer/funding", "/organizer/campaigns", "/organizer/cooperation", "/organizer/expeditions", "/organizer/partners", "/organizer/reviews"];

/** Funding, missions and cooperation stay muted until the company profile is approved. */
export function SectionGate({ approved, hasSpace, children }: { approved: boolean; hasSpace: boolean; children: React.ReactNode }) {
  const path = usePathname() ?? "";
  if (approved || !LOCKED_PATHS.some((p) => path.startsWith(p))) return <>{children}</>;
  return (
    <div className="grid place-items-center py-16 text-center font-mono">
      <div className="max-w-md bg-[rgb(10_13_18/.7)] px-8 py-10" style={frame(18, `${INK} / .16)`)}>
        <GameIcon name="profile" size={84} className="mx-auto grayscale-[.3]" />
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.28em] text-orange">Locked</p>
        <h1 className="mt-1 font-display text-[24px] font-bold uppercase tracking-[0.04em] text-white">{hasSpace ? "Waiting for approval" : "Create your profile first"}</h1>
        <p className="mt-2 font-sans text-[15px] text-[rgb(214_219_225/.7)]">
          {hasSpace ? "This unlocks as soon as your company profile is approved." : "Set up your company profile to unlock funding, missions and cooperation."}
        </p>
        <Link href="/organizer" className="mt-6 inline-flex h-11 items-center bg-orange px-6 text-[12px] font-black uppercase tracking-[0.16em] text-[#140c05]" style={frame(10, "rgb(255 145 56)")}>
          Go to overview
        </Link>
      </div>
    </div>
  );
}

/**
 * Local demo only: a pending profile is approved automatically after a few seconds and a toast
 * announces it. In production the server route refuses and nothing happens.
 */
export function DemoApprove({ pending, demo }: { pending: boolean; demo: boolean }) {
  const router = useRouter();
  const [toast, setToast] = useState(false);
  useEffect(() => {
    if (!pending || !demo) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/organizer/space/demo-approve", { method: "POST" });
        const j = (await r.json().catch(() => null)) as { approved?: boolean; changed?: boolean } | null;
        if (r.ok && j?.changed) {
          setToast(true);
          router.refresh();
        }
      } catch {
        /* stays pending; an admin can still approve */
      }
    }, 5000);
    return () => clearTimeout(t);
  }, [pending, demo, router]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <div role="status" className="yv-toast fixed right-5 top-20 z-[80] flex w-[340px] items-start gap-3 bg-[rgb(8_11_16/.92)] p-4 font-mono backdrop-blur-xl" style={frame(12, "rgb(255 145 56 / .7)", 1, { shadow: "0 0 30px rgb(255 145 56 / .25)" })}>
      <GameIcon name="profile" size={44} />
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-orange">Profile approved</p>
        <p className="mt-1 font-sans text-[14px] leading-snug text-white">You&apos;re on the map. Funding, missions and cooperation are unlocked.</p>
      </div>
      <button type="button" aria-label="Dismiss" onClick={() => setToast(false)} className="text-[rgb(214_219_225/.5)] hover:text-white">
        ✕
      </button>
      <style>{`@keyframes yv-toast-in { from { opacity: 0; transform: translateX(24px) } to { opacity: 1; transform: none } } .yv-toast { animation: yv-toast-in 360ms cubic-bezier(.2,.8,.2,1) both }`}</style>
    </div>
  );
}
