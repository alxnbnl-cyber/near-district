"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCompass, IconFlag, IconMap, IconPlus } from "@/components/explore/icons";

const NAV = [
  { href: "/explore", label: "Explore", icon: IconCompass, match: (p: string) => p === "/" || p.startsWith("/explore") || p.startsWith("/s/") },
  { href: "/experiences", label: "Experiences", icon: IconFlag, match: (p: string) => p.startsWith("/experiences") },
  { href: "/me", label: "My Adventures", icon: IconMap, match: (p: string) => p.startsWith("/me") },
  { href: "/host", label: "Host a Space", icon: IconPlus, match: (p: string) => p.startsWith("/host") || p.startsWith("/organizer") },
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
                className={`relative flex h-[60px] items-center gap-2 px-3.5 text-[14px] font-medium transition-colors ${active ? "text-orange" : "text-ink-2 hover:text-ink"}`}
              >
                <n.icon size={17} />
                {n.label}
                {active && <span aria-hidden className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-orange" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Scrollable link row under the header on phones (content pages). */
export function MobileLinks() {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="Main mobile" className="overflow-x-auto border-t border-line md:hidden">
      <ul className="flex gap-1 px-3 py-1.5">
        {NAV.map((n) => (
          <li key={n.href}>
            <Link href={n.href} className={`block whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium ${n.match(path) ? "bg-orange-wash text-orange-ink" : "text-ink-2"}`}>
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Compact bottom navigation for phones (map pages). */
export function MobileNav() {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="Main mobile" className="border-t border-line bg-[#090b10f2] md:hidden">
      <ul className="grid grid-cols-4">
        {NAV.map((n) => (
          <li key={n.href}>
            <Link href={n.href} className={`flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium ${n.match(path) ? "text-orange" : "text-ink-3"}`}>
              <n.icon size={18} />
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
