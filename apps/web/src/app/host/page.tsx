import Link from "next/link";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { buttonClass } from "@/components/ui";

export const metadata = { title: "Host a Space" };

const STEPS = [
  {
    title: "Open your Space",
    body: "Your organization gets one building in the district that fits it. You describe who you are; we place it on the map.",
  },
  {
    title: "Design an experience",
    body: "Start with a Treasure Hunt (questions and clues) or a Creative Contest (ideas judged by your team).",
  },
  {
    title: "Fund the rewards",
    body: "Add a reward budget directly, and optionally deposit capital that earns lending interest. Only interest that has actually been collected can become rewards.",
  },
  {
    title: "Reward real participation",
    body: "Winners claim USDC to a NEAR wallet they've proven they own. Every payout is a public on-chain transaction.",
  },
];

export default function HostPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-12 md:py-16">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-orange-ink">For projects and communities</p>
        <h1 className="mt-2 max-w-2xl text-4xl font-semibold leading-tight md:text-5xl">Give people a reason to come and look around.</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-2">
          A Space is your building in Yielvy town. Inside it you run hunts and contests that get people genuinely exploring what you've made.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/organizer" className={buttonClass("primary", "lg")}>
            Open your Space
          </Link>
          <Link href="/help#organizers" className={buttonClass("secondary", "lg")}>
            How funding works
          </Link>
        </div>

        <ol className="mt-14 grid gap-4 md:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-lg border border-line bg-card p-5 shadow-lift">
              <span className="font-display text-sm font-bold text-orange-ink">0{i + 1}</span>
              <h2 className="mt-1 text-lg font-semibold">{s.title}</h2>
              <p className="mt-1.5 text-sm text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>

        <section className="mt-14 rounded-xl border border-line bg-paper-2 p-6">
          <h2 className="text-lg font-semibold">Before you start — the honest version</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-2">
            <li>• Lending yield is variable and small for small deposits: about $0.14 a day on $1,000 at 5% a year, before costs.</li>
            <li>• Deposited capital is supplied to the RHEA lending protocol on NEAR. That carries smart-contract and liquidity risk; withdrawals can be delayed when the market is heavily borrowed.</li>
            <li>• Funds sit in Yielvy's vault contract under on-chain rules. Rewards already promised to winners cannot be withdrawn by you or by us.</li>
            <li>• Real-money funding stays disabled until the contracts are independently audited and launch checks are complete.</li>
          </ul>
        </section>
      </main>
    </>
  );
}
