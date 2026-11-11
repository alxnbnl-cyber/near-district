import Link from "next/link";
import { frame } from "@/components/explore/frame";
import { GameIcon, type GameIconName } from "@/components/host/GameIcon";

export const metadata = { title: "How it works" };

const INK = "rgb(214 219 225";

const STEPS: { icon: GameIconName; title: string; body: string; points: string[] }[] = [
  {
    icon: "profile",
    title: "Create your company profile",
    body: "Add your name, logo and a one-line pitch. After a quick review you get your own pin on the map.",
    points: ["Your logo shows on the pin", "Review before you appear"],
  },
  {
    icon: "earn",
    title: "Fund the reward",
    body: "Deposit USDC into the vault. It earns interest on RHEA lending and only the interest becomes the prize.",
    points: ["Your deposit stays yours", "Prize grows every day"],
  },
  {
    icon: "host",
    title: "Build a mission",
    body: "Choose a clue hunt (players solve questions) or a creative challenge (players submit entries, you pick winners).",
    points: ["Write clues and answers", "Add hints players unlock", "Set start and end dates"],
  },
  {
    icon: "play",
    title: "Team up with partners",
    body: "Invite other projects. Their activities can unlock your hints, and missions can link into one shared trail.",
    points: ["Partner activities unlock hints", "Shared trails across projects", "Each project funds its own reward"],
  },
  {
    icon: "explore",
    title: "Go live and pay winners",
    body: "Publish and your pin lights up. Players find it, play, and the vault pays winners straight to their NEAR wallet.",
    points: ["Track players and finishers", "Winners paid on-chain"],
  },
];

/** Plain-language guide for companies, with the reward flow drawn out. */
export default function HowItWorksPage() {
  return (
    <div className="flex flex-col gap-8 font-mono">
      <section>
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-orange">How it works</p>
        <h1 className="mt-1 font-display text-[32px] font-bold uppercase leading-tight tracking-[0.02em] text-white">From profile to prize in five steps</h1>
      </section>

      <ol className="relative flex flex-col gap-3">
        <span aria-hidden className="absolute bottom-6 left-[43px] top-6 w-px bg-[linear-gradient(180deg,rgb(255_145_56/.5),rgb(214_219_225/.1))]" />
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative flex gap-5 bg-[rgb(10_13_18/.6)] p-5" style={frame(14, `${INK} / .12)`)}>
            <div className="relative shrink-0 self-start">
              <GameIcon name={s.icon} size={54} />
              <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center bg-orange text-[11px] font-black text-[#140c05]">{i + 1}</span>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-[14px] font-bold uppercase tracking-[0.14em] text-white">{s.title}</h2>
              <p className="mt-1.5 font-sans text-[15px] leading-relaxed text-[rgb(214_219_225/.75)]">{s.body}</p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {s.points.map((p) => (
                  <li key={p} className="flex items-center gap-1.5 bg-[rgb(255_255_255/.04)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[rgb(214_219_225/.75)]">
                    <span className="text-orange">✓</span> {p}
                  </li>
                ))}
              </ul>
              {i === 1 && <RewardFlow />}
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/organizer" className="inline-flex h-11 items-center bg-orange px-6 text-[12px] font-black uppercase tracking-[0.16em] text-[#140c05]" style={frame(10, "rgb(255 145 56)")}>
          Back to overview
        </Link>
      </div>
    </div>
  );
}

/** Deposit → vault → RHEA lending → interest = prize, deposit back. */
function RewardFlow() {
  const box = "flex flex-col items-center gap-1 bg-[rgb(255_255_255/.04)] px-3 py-2.5 text-center";
  const arrow = <span aria-hidden className="self-center text-[16px] text-orange">→</span>;
  return (
    <div className="mt-4 bg-[rgb(0_0_0/.25)] p-4" style={frame(10, "rgb(255 194 75 / .25)")}>
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-reward">Where the prize comes from</p>
      <div className="mt-3 flex flex-wrap items-stretch gap-2">
        <div className={box}>
          <span className="text-[18px]">🏢</span>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white">Your deposit</span>
          <span className="text-[10px] text-[rgb(214_219_225/.5)]">e.g. 10,000 USDC</span>
        </div>
        {arrow}
        <div className={box}>
          <span className="text-[18px]">🔐</span>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white">Vault</span>
          <span className="text-[10px] text-[rgb(214_219_225/.5)]">on-chain</span>
        </div>
        {arrow}
        <div className={box}>
          <span className="text-[18px]">📈</span>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-white">RHEA lending</span>
          <span className="text-[10px] text-[rgb(214_219_225/.5)]">earns interest</span>
        </div>
        {arrow}
        <div className={`${box} shadow-[inset_0_0_0_1px_rgb(255_194_75/.4)]`}>
          <span className="text-[18px]">🏆</span>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-reward">Interest = prize</span>
          <span className="text-[10px] text-[rgb(214_219_225/.5)]">paid to winners</span>
        </div>
      </div>
      <p className="mt-3 font-sans text-[13px] text-[rgb(214_219_225/.65)]">When the mission ends, you withdraw your deposit. Only the interest it earned was given away.</p>
    </div>
  );
}
