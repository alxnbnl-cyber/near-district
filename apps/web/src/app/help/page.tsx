import { SiteHeader } from "@/components/shell/SiteHeader";

export const metadata = { title: "Help" };

const EXPLORERS: [string, string][] = [
  ["Do I need crypto to explore?", "No. You can wander the map and read every campaign without an account. Email sign-in is enough to take part. You only need a NEAR wallet to receive a token reward."],
  ["Is it free?", "Yes. Taking part never costs anything. Claiming a reward needs a tiny amount of NEAR for network fees, paid from your own wallet."],
  ["How are winners chosen?", "Each campaign publishes its rule up front: equal split, top scores, organizer judging, or (where legally allowed) a random draw seeded on-chain after eligibility is frozen."],
  ["When can I claim?", "After a reward period ends, results are finalized, the funds are locked in the vault contract, and a short dispute window passes. Then the reward shows as claimable in My Rewards."],
  ["Why was my result put on hold?", "Very fast completions, duplicate accounts and shared answers are reviewed by a person before rewards. You can ask us to look again."],
];

const ORGANIZERS: [string, string][] = [
  ["Where does my money go?", "Into Yielvy's vault smart contract on NEAR, recorded against your campaign. Principal you choose to supply goes to the RHEA lending market as a plain deposit — never used as collateral, never borrowed against."],
  ["What is 'yield' here?", "Interest RHEA pays on your deposit. It changes with borrowing demand. Only interest that has actually been withdrawn and settled can become rewards; estimates are never paid out."],
  ["Can I get my principal back?", "Yes, subject to RHEA having enough unborrowed liquidity at that moment. You can withdraw idle principal at any time; rewards already promised to winners stay locked until claimed or expired."],
  ["What can Yielvy's team do with my funds?", "Not move them to anyone but you or proven winners. Our operator key can trigger settlements and propose results within limits you set, and you (or our guardian) can veto results during a dispute window. Contract upgrades are timelocked so you can exit first."],
  ["What are the risks?", "Smart-contract risk (ours and RHEA's), lending liquidity risk, stablecoin risk and network risk. Real-money funding stays off until independent security review is complete."],
];

export default function HelpPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-semibold">Help</h1>
        <section className="mt-8" id="explorers">
          <h2 className="text-xl font-semibold">For explorers</h2>
          <dl className="mt-4 divide-y divide-line rounded-lg border border-line bg-card">
            {EXPLORERS.map(([q, a]) => (
              <div key={q} className="px-5 py-4">
                <dt className="font-semibold">{q}</dt>
                <dd className="mt-1 text-sm text-ink-2">{a}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="mt-10" id="organizers">
          <h2 className="text-xl font-semibold">For organizers</h2>
          <dl className="mt-4 divide-y divide-line rounded-lg border border-line bg-card">
            {ORGANIZERS.map(([q, a]) => (
              <div key={q} className="px-5 py-4">
                <dt className="font-semibold">{q}</dt>
                <dd className="mt-1 text-sm text-ink-2">{a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </>
  );
}
