import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { getSessionUser } from "@/server/session";
import { UserMenu } from "./UserMenu";

const NAV = [
  { href: "/", label: "Explore" },
  { href: "/experiences", label: "Experiences" },
  { href: "/me", label: "My Adventures" },
  { href: "/host", label: "Host a Space" },
];

export async function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const user = await getSessionUser();
  return (
    <header
      className={
        overlay
          ? "pointer-events-none absolute inset-x-0 top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-4"
          : "sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur px-3 sm:px-5"
      }
    >
      <div
        className={`pointer-events-auto mx-auto flex h-14 items-center gap-2 sm:gap-6 ${
          overlay ? "max-w-none rounded-[18px] border border-line bg-paper/92 px-3 shadow-lift backdrop-blur sm:px-4" : "max-w-6xl"
        }`}
      >
        <Link href="/" className="shrink-0 rounded-md px-1" aria-label="Yielvy home">
          <Logo size={24} />
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="rounded-md px-3 py-2 text-[14px] font-medium text-ink-2 hover:bg-paper-2 hover:text-ink">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <UserMenu user={user ? { displayName: user.displayName, isAdmin: user.adminRoles.length > 0 } : null} />
        </div>
      </div>
      <nav aria-label="Main mobile" className="pointer-events-auto md:hidden">
        <ul className={`mx-auto mt-2 flex gap-1 overflow-x-auto ${overlay ? "" : "pb-2"}`}>
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="block whitespace-nowrap rounded-full border border-line bg-paper/95 px-3 py-1.5 text-[13px] font-medium text-ink-2">
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
