import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { emailEnabled } from "@/server/env";
import { frame } from "@/components/explore/frame";
import { SignInForm } from "./SignInForm";
import { CloseLink } from "./CloseLink";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const INK = "rgb(214 219 225";

/** Sign in over the game map: the world in the background, one back button, an angled modal. */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (await getSessionUser()) redirect(safeNext);
  // back goes where the player came from: the host console counts as "home", everything else returns to the map
  const back = safeNext.startsWith("/organizer") || safeNext === "/" ? { href: "/", label: "Back to home" } : { href: safeNext.startsWith("/explore") ? safeNext : "/explore", label: "Back to map" };

  return (
    <main data-signin className="yv-si relative min-h-dvh overflow-hidden bg-[#05070a] text-ink">
      {/* the world, slowly drifting */}
      <div aria-hidden className="yv-si-map absolute -inset-[8%] bg-cover bg-center opacity-60 [filter:grayscale(1)_brightness(.55)_contrast(1.15)]" style={{ backgroundImage: "url(/assets/world/map-v1@2x.webp)" }} />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: "linear-gradient(rgb(214 219 225 / .04) 1px, transparent 1px), linear-gradient(90deg, rgb(214 219 225 / .04) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      <div aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgb(0_0_0/.18)_0px,rgb(0_0_0/.18)_1px,transparent_1px,transparent_3px)]" />
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgb(5_7_10/.85)_80%)]" />
      {/* a few mission beacons */}
      {[
        ["22%", "30%"],
        ["71%", "24%"],
        ["63%", "72%"],
        ["30%", "76%"],
      ].map(([l, t], i) => (
        <span key={i} aria-hidden className="absolute size-3 -translate-x-1/2 -translate-y-1/2" style={{ left: l, top: t }}>
          <span className="absolute inset-0 rounded-full bg-orange shadow-[0_0_14px_rgb(255_145_56/.8)]" />
          <span className="absolute -inset-3 rounded-full border border-orange/60" style={{ animation: `yv-si-ping 2.4s ease-out ${i * 0.6}s infinite` }} />
        </span>
      ))}
      {/* HUD frame */}
      <div aria-hidden className="pointer-events-none absolute inset-3 border" style={{ borderColor: `${INK} / .14)` }}>
        {["left-[-1px] top-[-1px] border-l-2 border-t-2", "right-[-1px] top-[-1px] border-r-2 border-t-2", "left-[-1px] bottom-[-1px] border-l-2 border-b-2", "right-[-1px] bottom-[-1px] border-r-2 border-b-2"].map((c) => (
          <span key={c} className={`absolute size-5 ${c}`} style={{ borderColor: `${INK} / .55)` }} />
        ))}
      </div>

      <CloseLink
        href={back.href}
        className="group absolute left-6 top-6 z-30 flex h-10 items-center gap-2 bg-[rgb(5_7_10/.75)] px-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[rgb(214_219_225/.75)] backdrop-blur transition-colors hover:text-white"
        style={frame(9, `${INK} / .22)`)}
      >
        <span aria-hidden className="transition-transform group-hover:-translate-x-0.5">←</span>
        {back.label}
      </CloseLink>

      <div className="relative z-10 grid min-h-dvh place-items-center px-4 py-20">
        <SignInForm next={safeNext} emailAvailable={emailEnabled()} closeHref={back.href} />
      </div>

      <style>{`
        @keyframes yv-si-bg-in { from { opacity: 0 } to { opacity: 1 } }
        .yv-si > * { animation: yv-si-bg-in 380ms ease-out both }
        @keyframes yv-si-bg-out { to { opacity: 0 } }
        .yv-si[data-closing] > * { animation: yv-si-bg-out 260ms ease-in both }
        @keyframes yv-si-drift { 0% { transform: translate(0,0) scale(1.02) } 50% { transform: translate(-2.5%,-1.5%) scale(1.06) } 100% { transform: translate(0,0) scale(1.02) } }
        .yv-si-map { animation: yv-si-drift 60s ease-in-out infinite }
        @keyframes yv-si-ping { 0% { transform: scale(.4); opacity: .9 } 100% { transform: scale(1.6); opacity: 0 } }
        @media (prefers-reduced-motion: reduce) { .yv-si-map, .yv-si > * { animation: none } }
      `}</style>
    </main>
  );
}
