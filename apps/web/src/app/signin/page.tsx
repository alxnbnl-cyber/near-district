import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { getSessionUser } from "@/server/session";
import { emailEnabled } from "@/server/env";
import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (await getSessionUser()) redirect(safeNext);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-12 md:grid-cols-[1fr_420px] md:py-20">
        <section className="hidden md:block">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-orange-ink">Welcome in</p>
          <h1 className="mt-2 text-4xl font-semibold leading-tight">Every mission on the map hides a prize.</h1>
          <p className="mt-4 max-w-md text-ink-2">
            You can wander the map without an account. Sign in to play and keep your prizes.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-ink-2">
            <li className="flex gap-3"><span className="mt-1.5 size-2 rounded-full bg-orange" />Email works fine to start exploring and taking part.</li>
            <li className="flex gap-3"><span className="mt-1.5 size-2 rounded-full bg-sky" />To receive a token reward you'll link a NEAR wallet you control.</li>
            <li className="flex gap-3"><span className="mt-1.5 size-2 rounded-full bg-mint" />We never create, hold or see your wallet's keys.</li>
          </ul>
        </section>
        <SignInForm next={safeNext} emailAvailable={emailEnabled()} />
      </main>
    </>
  );
}
