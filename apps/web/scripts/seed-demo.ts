/**
 * LOCAL DEVELOPMENT ONLY: wipes the local database and seeds the NEAR District demo:
 * RHEA Finance (treasure hunt), NEAR (creative challenge, company picks winners) and
 * Meteor Wallet (treasure hunt), each with a fixed planned prize.
 *
 * No vault is deployed locally, so the missions are published without on-chain funding and the
 * map shows their planned prize tagged DEMO (DEMO_REWARDS=1). Nothing here moves funds.
 *
 *   pnpm --filter @yielvy/web seed:demo
 */
import { fileURLToPath } from "node:url";
import { campaigns, createDb, organizations, spaces, users, eq, sql } from "@yielvy/db";
import { runMigrations } from "@yielvy/db/migrate";
import { addQuestion, createDraft, publishCampaign, updateCampaign } from "../src/server/campaigns";
import { createSpace } from "../src/server/spaces";
import { saveHint } from "../src/server/hints";
import { listQuestions } from "../src/server/campaigns";
import type { SessionUser } from "../src/server/session";
import type { QuestionInput } from "../src/lib/campaign-schemas";

if (!process.env.DATABASE_URL) process.loadEnvFile(fileURLToPath(new URL("../../../.env.local", import.meta.url)));
const url = process.env.DATABASE_URL ?? "";
const host = new URL(url).hostname;
if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1"].includes(host)) {
  console.error("seed-demo refuses to run outside a local development database.");
  process.exit(1);
}

const h = await createDb(url, { max: 1 });
const db = h.db;

// wipe: drop every table and re-run migrations from scratch
await db.execute(sql`drop schema if exists public cascade`);
await db.execute(sql`drop schema if exists drizzle cascade`);
await db.execute(sql`create schema public`);
await runMigrations(db, url);
console.log("database wiped and migrated");

const network = process.env.NEAR_NETWORK === "testnet" ? "testnet" : "mainnet";
const USDC = (n: number) => (BigInt(n) * 1_000_000n).toString();
const DAY = 86_400_000;

async function owner(name: string, account: string): Promise<SessionUser> {
  const [u] = await db.insert(users).values({ displayName: name }).returning();
  await db.execute(
    sql`insert into wallet_connections (user_id, network, account_id, public_key, is_payout, verified_at)
        values (${u!.id}, ${network}, ${account}, 'ed25519:demo-fixture-not-a-real-key', true, now())`,
  );
  return { sessionId: "seed", userId: u!.id, displayName: name, email: null, status: "active", walletVerifiedAt: new Date(), payoutAccountId: account, adminRoles: [] };
}

const q = (x: Partial<QuestionInput> & Pick<QuestionInput, "type" | "prompt">): QuestionInput =>
  ({ difficulty: 1, maxAttempts: 10, cooldownSeconds: 0, caseSensitive: false, stripPunctuation: false, numericTolerance: "0", ...x }) as QuestionInput;

interface Demo {
  org: string;
  slug: string;
  account: string;
  category: string;
  style: "workshop" | "tower" | "market" | "atelier" | "observatory" | "pavilion";
  tagline: string;
  description: string;
  website: string;
  mission: {
    template: "treasure_hunt" | "creative_contest";
    title: string;
    summary: string;
    description: string;
    prize: number;
    days: number;
    winners?: number;
    questions?: QuestionInput[];
  };
}

const DEMOS: Demo[] = [
  {
    org: "RHEA Finance",
    slug: "rhea",
    account: `rhea-demo.${network}`,
    category: "defi",
    style: "market",
    tagline: "The liquidity hub of NEAR",
    description: "Swap, lend and borrow on NEAR with RHEA Finance.",
    website: "https://rhea.finance",
    mission: {
      template: "treasure_hunt",
      title: "The RHEA Liquidity Trail",
      summary: "Follow the trail through RHEA and split a fixed USDC prize.",
      description: "Decrypt every secret before the deadline. Everyone who gets them all right splits the prize equally, paid to their NEAR wallet.",
      prize: 300,
      days: 7,
      questions: [
        q({ type: "multiple_choice", prompt: "Which blockchain does RHEA Finance run on?", options: [{ id: "a", label: "NEAR" }, { id: "b", label: "Ethereum" }, { id: "c", label: "Solana" }], correctOptionId: "a", revealText: "RHEA Finance is built on NEAR." }),
        q({ type: "short_text", prompt: "On RHEA, what do you call supplying tokens so others can borrow them? (one word)", answers: ["lending", "lend", "supply", "supplying"], revealText: "Supplying to RHEA Lending." }),
        q({ type: "multiple_choice", prompt: "What do you get back when you swap on RHEA?", options: [{ id: "a", label: "A different token" }, { id: "b", label: "An NFT" }, { id: "c", label: "Nothing" }], correctOptionId: "a" }),
      ],
    },
  },
  {
    org: "NEAR",
    slug: "near",
    account: `near-demo.${network}`,
    category: "infrastructure",
    style: "tower",
    tagline: "The blockchain for AI and abstraction",
    description: "NEAR Protocol: fast, low-cost and built for everyone.",
    website: "https://near.org",
    mission: {
      template: "creative_contest",
      title: "Show Us Your NEAR Idea",
      summary: "Pitch an app for NEAR. Our team picks the winners.",
      description: "Share an idea for an app on NEAR in a short write-up or sketch. The NEAR team picks 3 winners, who split the prize equally.",
      prize: 500,
      days: 10,
      winners: 3,
    },
  },
  {
    org: "Meteor Wallet",
    slug: "meteor",
    account: `meteor-demo.${network}`,
    category: "tooling",
    style: "observatory",
    tagline: "The friendliest wallet on NEAR",
    description: "A simple, secure NEAR wallet for web and mobile.",
    website: "https://meteorwallet.app",
    mission: {
      template: "treasure_hunt",
      title: "The Meteor Shower Hunt",
      summary: "Decrypt the secrets about Meteor Wallet and split the prize.",
      description: "Decrypt every secret before the deadline. Everyone who gets them all right splits the prize equally, paid to their NEAR wallet.",
      prize: 200,
      days: 5,
      questions: [
        q({ type: "multiple_choice", prompt: "What kind of app is Meteor?", options: [{ id: "a", label: "A NEAR wallet" }, { id: "b", label: "A game" }, { id: "c", label: "A browser" }], correctOptionId: "a" }),
        q({ type: "short_text", prompt: "What do you sign with Meteor to sign in to NEAR District? (one word)", answers: ["message", "a message"], revealText: "A short message (NEP-413). It sends no transaction." }),
      ],
    },
  },
];

for (const d of DEMOS) {
  const me = await owner(`${d.org} team`, d.account);
  const { space } = await createSpace(db, me, {
    organizationName: d.org,
    name: d.org,
    slug: d.slug,
    category: d.category,
    tagline: d.tagline,
    description: d.description,
    websiteUrl: d.website,
    socials: {},
    buildingStyle: d.style,
  });
  await db.update(spaces).set({ moderation: "approved" }).where(eq(spaces.id, space.id));
  await db.update(organizations).set({ status: "approved" }).where(eq(organizations.id, space.organizationId));

  const m = d.mission;
  const c = await createDraft(db, me, space.id, { template: m.template, title: m.title });
  for (const question of m.questions ?? []) await addQuestion(db, me, c, question);
  // demo hints: unlocked by calling a contract function (testnet guest book); a partner on secret 2
  if (m.questions?.length) {
    const qs = await listQuestions(db, c.id);
    for (const [i, q] of qs.slice(0, 2).entries()) {
      await saveHint(db, me, c, {
        questionId: q.id,
        title: "Hint",
        teaser: "",
        content: i === 0 ? "Think of the network the whole district is built on." : "Two words: the action that adds supply for borrowers.",
        unlock: {
          kind: "group",
          op: "ANY",
          children: [
            {
              kind: "activity",
              id: "unlock",
              ownerOrgId: space.organizationId,
              activity: {
                type: "near_contract_call",
                network,
                contractId: network === "testnet" ? "guest-book.testnet" : "social.near",
                methodName: network === "testnet" ? "addMessage" : "set",
                title: i === 0 ? "Sign the district guest book" : "Leave a message on the partner board",
                description: "Use the same wallet you signed in with.",
                ...(i === 1 ? { partner: { name: "NEAR Guest Book", url: "https://examples.near.org/guest-book" } } : {}),
              },
            },
          ],
        },
        withdrawalPolicy: "disable",
      });
    }
  }
  const hunt = m.template === "treasure_hunt";
  await updateCampaign(db, me, c, {
    summary: m.summary,
    description: m.description,
    rules: {
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + m.days * DAY).toISOString(),
      // no vault locally: published unfunded, shown with its planned prize tagged DEMO
      fundingSource: "none",
      plannedDirectBudget: USDC(m.prize),
      reward: { mode: hunt ? "equal" : "organizer_selected", winnersCount: hunt ? 10_000 : (m.winners ?? 1), minPayout: "0", tieBreak: "earliest_completion" },
      ...(hunt ? {} : { judgingCriteria: [{ key: "idea", label: "Idea", weightBps: 6000 }, { key: "clarity", label: "Clarity", weightBps: 4000 }] }),
    },
  });
  const [fresh] = await db.select().from(campaigns).where(eq(campaigns.id, c.id));
  await publishCampaign(db, me, fresh!);
  console.log(`seeded ${d.org}: ${m.title} (${m.prize} USDC, ${hunt ? "split by everyone correct" : `${m.winners} winners picked`})`);
}

await h.close();
console.log("done");
