"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  ["/organizer", "Overview"],
  ["/organizer/campaigns", "Missions"],
  ["/organizer/funding", "Prize funding"],
  ["/organizer/cooperation", "Cooperation"],
  ["/organizer/reviews", "Reviews"],
  ["/organizer/space", "Profile"],
  ["/organizer/settings", "Settings"],
] as const;

export function OwnerNav() {
  const path = usePathname() ?? "";
  return (
    <nav aria-label="Project owner">
      <ul className="flex gap-1 overflow-x-auto md:flex-col">
        {NAV.map(([href, label]) => {
          const active = href === "/organizer" ? path === href : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap rounded-[10px] px-3 py-2 text-[14px] font-semibold transition-colors ${active ? "bg-orange-wash text-orange-ink" : "text-ink-2 hover:bg-paper-2 hover:text-ink"}`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
