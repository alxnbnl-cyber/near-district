import { SiteHeader } from "@/components/shell/SiteHeader";

export const metadata = { title: "Help" };

const EXPLORERS: [string, string][] = [
  ["What do I need to play?", "A NEAR wallet. You can wander the map and read every mission without one, but you sign in with your NEAR wallet to play, and prizes are paid to that same wallet."],
  ["Is it free?", "Yes. Playing never costs anything."],
  ["How are winners chosen?", "Treasure hunts: when the deadline ends, everyone who decrypted every secret correctly splits the prize equally. Creative challenges: the company picks the winners, who split the prize equally."],
  ["Can I change my answers?", "Yes, until the deadline. Answers are sealed and only checked when the mission ends."],
  ["When do I get paid?", "After the deadline, once results are final. The prize is sent automatically from the vault to your NEAR wallet."],
  ["Why was my result put on hold?", "Very fast completions, duplicate accounts and shared answers are reviewed by a person before prizes are paid. You can ask us to look again."],
];

const ORGANIZERS: [string, string][] = [
  ["Where does my money go?", "Into the NEAR District vault smart contract on NEAR, recorded against your mission. It is a fixed prize: it sits in the vault until the deadline and is not lent out or invested."],
  ["How is the prize split?", "Equally. For a treasure hunt, among everyone who decrypted every secret correctly; for a creative challenge, among the winners your team picks."],
  ["What if nobody wins?", "The prize stays yours. Wind the mission down and withdraw it back to your NEAR wallet."],
  ["What can the NEAR District team do with my funds?", "Not move them to anyone but you or proven winners. Our operator key can trigger settlements within the limits you set, and contract upgrades are timelocked so you can exit first."],
  ["What are the risks?", "Smart-contract risk, stablecoin risk and network risk. Real-money funding stays off until independent security review is complete."],
];

export default function HelpPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-semibold">Help</h1>
        <section className="mt-8" id="explorers">
          <h2 className="text-xl font-semibold">For players</h2>
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
          <h2 className="text-xl font-semibold">For companies</h2>
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
