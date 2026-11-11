import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { getSessionUser } from "@/server/session";
import { UserMenu } from "./UserMenu";
import { MobileLinks, NavLinks } from "./NavLinks";
import { NotificationBell } from "./NotificationBell";

export async function SiteHeader({ mobileRow = true }: { mobileRow?: boolean }) {
  const user = await getSessionUser();
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-[#090b10f2] backdrop-blur">
      <div className="mx-auto flex h-[60px] max-w-[1600px] items-center gap-3 px-3 sm:px-5">
        <Link href="/explore" className="shrink-0 rounded-md px-1" aria-label="NEAR District — explore">
          <Logo size={20} />
        </Link>
        <NavLinks />
        <div className="ml-auto flex items-center gap-1.5">
          {user && <NotificationBell />}
          <UserMenu user={user ? { displayName: user.displayName, isAdmin: user.adminRoles.length > 0 } : null} />
        </div>
      </div>
      {mobileRow && <MobileLinks />}
    </header>
  );
}
