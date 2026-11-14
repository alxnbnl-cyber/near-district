"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCompass, IconPlus } from "@/components/explore/icons";

/** Two destinations only: play (the map) or host (your vault). Everything else lives inside them. */
const NAV = [
  { href: "/explore", label: "Explore", icon: IconCompass, match: (p: string) => p === "/" || p.startsWith("/explore") || p.startsWith("/s/") || p.startsWith("/x/") || p.startsWith("/me") },
  { href: "/organizer", label: "Host", icon: IconPlus, match: (p: string) => p.startsWith("/host") || p.startsWith("/organizer") },
];

export function NavLinks() {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="mx-auto hidden md:block">
      <ul className="flex items-center gap-1">
        {NAV.map((n) => {
          const active = n.match(path);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-[60px] items-center gap-2 px-3.5 text-[14px] font-semibold transition-colors ${active ? "text-orange" : "text-ink-2 hover:text-ink"}`}
              >
                <n.icon size={17} />
                {n.label}
                {active && <span aria-hidden className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-orange" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Link row under the header on phones (content pages). */
export function MobileLinks() {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="Main mobile" className="border-t border-line md:hidden">
      <ul className="flex gap-1 px-3 py-1.5">
        {NAV.map((n) => (
          <li key={n.href}>
            <Link href={n.href} className={`block whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold ${n.match(path) ? "bg-orange-wash text-orange-ink" : "text-ink-2"}`}>
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MobileNav() {
  return <MobileLinks />;
}
