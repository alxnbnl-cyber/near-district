/**
 * LOCAL DEVELOPMENT ONLY: wipes the local database and seeds the NEAR District demo.
 *
 * Four treasure hunts (RHEA, NEAR, LiNEAR with three secrets; NEAR Social with two), with one hint
 * per secret. Secret 1's hint is the company's own on-chain activity; the other secrets link partner
 * companies, with their activity. Every activity is a real testnet contract function, verified
 * on-chain when a player presses "I did it".
 *
 * Prizes:
 *   - With VAULT_CONTRACT_ID set on testnet, every prize is REAL testnet USDC locked in the NEAR District
 *     prize vault: each company's own testnet wallet (<company>.neardistrict-host.testnet, keys in
 *     ~/.near-credentials) opens its mission's escrow and deposits the prize, and the mission is then
 *     published through the normal publish check, which verifies the deposit on-chain.
 *     A short "warm-up" mission is added that ends a few minutes after seeding (WARMUP_MINUTES, default 8)
 *     with the Demo Explorer's correct answers locked in, so the worker can settle it and pay the
 *     Demo Explorer's wallet (neardistrict-player.testnet) on-chain.
 *   - Without a vault, missions are published unfunded and the map shows their planned prize tagged DEMO.
 *
 *   pnpm --filter @yielvy/web seed:demo
 *
 * LIVE (hosted) mode, add-only: never wipes, refuses to run twice, logos point at /public/assets/demo-logos.
 * Put the hosted database URL in .env.railway (DATABASE_URL=..., git-ignored), then:
 *   pnpm --filter @yielvy/web seed:demo -- --live
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { Account, KeyPairSigner, providers } from "near-api-js";
import { createHash } from "node:crypto";
import { campaigns, chainTransactions, createDb, organizations, spaces, uploads, users, eq, sql } from "@yielvy/db";
import { parseVaultEvents } from "@yielvy/near";
import { joinCampaign, submitAnswer } from "../src/server/play";
import { runMigrations } from "@yielvy/db/migrate";
import { addQuestion, createDraft, listQuestions, publishCampaign, updateCampaign } from "../src/server/campaigns";
import { createSpace } from "../src/server/spaces";
import { saveHint } from "../src/server/hints";
import { storeImage } from "../src/server/uploads";
import type { SessionUser } from "../src/server/session";
import type { QuestionInput } from "../src/lib/campaign-schemas";

const LIVE = process.argv.includes("--live");
if (!process.env.DATABASE_URL || LIVE) process.loadEnvFile(fileURLToPath(new URL("../../../.env.local", import.meta.url)));
if (LIVE) {
  // the hosted database URL lives in its own git-ignored file so it never replaces the local one by accident
  const live = fileURLToPath(new URL("../../../.env.railway", import.meta.url));
  const m = /^DATABASE_URL=(.+)$/m.exec(readFileSync(live, "utf8"));
  if (!m) throw new Error(".env.railway must contain DATABASE_URL=<hosted Postgres public URL>");
  process.env.DATABASE_URL = m[1]!.trim();
}
const url = process.env.DATABASE_URL ?? "";
const host = new URL(url).hostname;
const isLocal = ["localhost", "127.0.0.1"].includes(host);
if (!LIVE && (process.env.NODE_ENV === "production" || !isLocal)) {
  console.error("seed-demo refuses to run outside a local development database (use --live for the hosted one).");
  process.exit(1);
}

const h = await createDb(url, { max: 1 });
const db = h.db;

if (LIVE) {
  await runMigrations(db, url);
  const [existing] = await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.slug, "rhea")).limit(1);
  if (existing) {
    console.error(`live seed: the demo companies already exist on ${host}; nothing was changed.`);
    await h.close();
    process.exit(1);
  }
  console.log(`live seed: adding the demo to ${host} (nothing is deleted)`);
} else {
  // wipe: drop every table and re-run migrations from scratch
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  await runMigrations(db, url);
  console.log("database wiped and migrated");
}

const network = process.env.NEAR_NETWORK === "testnet" ? "testnet" : "mainnet";
const USDC = (n: number) => (BigInt(n) * 1_000_000n).toString();
const DAY = 86_400_000;
const VAULT = process.env.VAULT_CONTRACT_ID ?? "";
const ONCHAIN = Boolean(VAULT) && network === "testnet";
const PRIZE_TOKEN = process.env.NEXT_PUBLIC_TESTNET_USDC_CONTRACT ?? "usdc.fakes.testnet";
const RPC_URL = (process.env.NEAR_RPC_URLS ?? "https://rpc.testnet.fastnear.com").split(",")[0]!.trim();
const PLAYER_WALLET = "neardistrict-player.testnet";

type Key = "rhea" | "near" | "linear" | "social";

/** Each company's own on-chain activity (real contracts on testnet). */
const ACTIVITY: Record<Key, { contractId: string; methodName: string; title: string; description: string }> = {
  rhea: {
    contractId: network === "testnet" ? "contract.1638481328.burrow.testnet" : "contract.main.burrow.near",
    methodName: "storage_deposit",
    title: "Register your account on RHEA Lending",
    description: "Open RHEA, connect the same wallet and register for Lending (a small storage deposit).",
  },
  near: {
    contractId: network === "testnet" ? "wrap.testnet" : "wrap.near",
    methodName: "near_deposit",
    title: "Wrap some NEAR into wNEAR",
    description: "Wrap any amount of NEAR into wNEAR with the same wallet you signed in with.",
  },
  social: {
    contractId: network === "testnet" ? "v1.social08.testnet" : "social.near",
    methodName: "set",
    title: "Save your profile on NEAR Social",
    description: "Open NEAR Social, connect the same wallet and save your profile (a name is enough).",
  },
  linear: {
    contractId: network === "testnet" ? "linear-protocol.testnet" : "linear-protocol.near",
    methodName: "deposit_and_stake",
    title: "Stake NEAR on LiNEAR to get LiNEAR",
    description: "Open LiNEAR, connect the same wallet and stake any amount of NEAR.",
  },
};

interface Company {
  key: Key;
  org: string;
  slug: string;
  account: string;
  category: string;
  style: "workshop" | "tower" | "market" | "atelier" | "observatory" | "pavilion";
  tagline: string;
  description: string;
  website: string;
  logo: string;
}

const COMPANIES: Company[] = [
  {
    key: "rhea",
    org: "RHEA Finance",
    slug: "rhea",
    account: wallet("rhea"),
    category: "defi",
    style: "market",
    tagline: "The liquidity hub of NEAR",
    description: "Swap, lend and borrow on NEAR, all in one app.",
    website: "https://app.rhea.finance/",
    logo: "rhea.png",
  },
  {
    key: "near",
    org: "NEAR",
    slug: "near",
    account: wallet("near"),
    category: "infrastructure",
    style: "tower",
    tagline: "The blockchain for AI and everyone",
    description: "NEAR Protocol is a fast, low-cost blockchain with human-readable accounts.",
    website: "https://near.com/",
    logo: "near.png",
  },
  {
    key: "linear",
    org: "LiNEAR Protocol",
    slug: "linear",
    account: wallet("linear"),
    category: "defi",
    style: "observatory",
    tagline: "Liquid staking on NEAR",
    description: "Stake NEAR, receive LiNEAR, and keep using it across DeFi while you earn staking rewards.",
    website: "https://linearprotocol.org/",
    logo: "linear.png",
  },
  {
    key: "social",
    org: "NEAR Social",
    slug: "near-social",
    account: wallet("social"),
    category: "social",
    style: "pavilion",
    tagline: "The open social layer of NEAR",
    description: "Profiles, posts and small apps, all stored on-chain and owned by you.",
    website: "https://near.social/",
    logo: "near-social.png",
  },
];

// ---------------------------------------------------------------- on-chain prizes (testnet)
function wallet(key: string): string {
  return ONCHAIN ? `${key}.neardistrict-host.testnet` : `${key}-demo.${network}`;
}
function accountFor(accountId: string): Account {
  const cred = JSON.parse(readFileSync(`${homedir()}/.near-credentials/testnet/${accountId}.json`, "utf8")) as { private_key: string };
  return new Account(accountId, new providers.JsonRpcProvider({ url: RPC_URL }), KeyPairSigner.fromSecretKey(cred.private_key as `ed25519:${string}`));
}
async function chainCall(acc: Account, contractId: string, methodName: string, args: object, deposit: bigint, tgas: number) {
  const out = (await acc.callFunctionRaw({ contractId, methodName, args, gas: BigInt(tgas) * 10n ** 12n, deposit })) as unknown as {
    transaction: { hash: string; signer_id: string; receiver_id: string };
    status: { SuccessValue?: string; Failure?: unknown };
    receipts_outcome: { outcome: { logs: string[]; executor_id: string } }[];
  };
  if (out.status.Failure) throw new Error(`${methodName} failed: ${JSON.stringify(out.status.Failure)}`);
  const logs = out.receipts_outcome.filter((r) => r.outcome.executor_id === VAULT).flatMap((r) => r.outcome.logs);
  const events = parseVaultEvents(logs);
  await db.insert(chainTransactions).values({ network, txHash: out.transaction.hash, signerId: out.transaction.signer_id, receiverId: out.transaction.receiver_id, status: "success", events, verifiedAt: new Date() }).onConflictDoNothing();
  return { hash: out.transaction.hash, events };
}
/** The company wallet opens the mission's escrow (deadline = mission deadline) and deposits the prize. */
async function lockPrize(accountId: string, endsAt: Date, amount: bigint): Promise<{ missionId: bigint; tx: string }> {
  const acc = accountFor(accountId);
  const created = await chainCall(acc, VAULT, "create_mission", { deadline_ns: (BigInt(endsAt.getTime()) * 1_000_000n).toString() }, 10n ** 22n, 30);
  const id = created.events.find((e) => e.event === "mission_created")?.data.mission_id;
  if (!id) throw new Error("create_mission emitted no mission id");
  const funded = await chainCall(acc, PRIZE_TOKEN, "ft_transfer_call", { receiver_id: VAULT, amount: amount.toString(), msg: JSON.stringify({ mission_id: id }) }, 1n, 100);
  if (!funded.events.some((e) => e.event === "prize_funded" && e.data.amount === amount.toString())) throw new Error("prize deposit was not accepted by the vault");
  // the publish check reads at "final" finality, a couple of blocks behind execution
  const rpc = new providers.JsonRpcProvider({ url: RPC_URL });
  for (let i = 0; i < 30; i++) {
    const r = (await rpc.query({ request_type: "call_function", finality: "final", account_id: VAULT, method_name: "get_mission", args_base64: Buffer.from(JSON.stringify({ mission_id: id })).toString("base64") })) as unknown as { result: number[] };
    const m = JSON.parse(Buffer.from(r.result).toString()) as { prize: string } | null;
    if (m && BigInt(m.prize) >= amount) break;
    await new Promise((res) => setTimeout(res, 1000));
  }
  return { missionId: BigInt(id), tx: funded.hash };
}

interface Secret {
  prompt: string;
  answers: string[];
  reveal: string;
  hint: string;
  /** Whose activity unlocks the hint (the hunt owner for secret 1, a partner for 2 and 3). */
  activityOf: Key;
}

interface Hunt {
  owner: Key;
  title: string;
  summary: string;
  description: string;
  prize: number;
  days: number;
  /** ends this many minutes after seeding (the on-chain payout warm-up) */
  minutes?: number;
  secrets: Secret[];
}

const HUNTS: Hunt[] = [
  {
    owner: "rhea",
    title: "The RHEA Liquidity Trail",
    summary: "Follow the liquidity through RHEA and split 300 USD.",
    description: "Three secrets are hidden across RHEA and its friends on NEAR. Decrypt all three before the deadline and you split the prize with everyone else who did.",
    prize: 300,
    days: 7,
    secrets: [
      {
        prompt: "RHEA's lending market grew out of which NEAR lending protocol? (one word)",
        answers: ["Burrow"],
        reveal: "Burrow: it became the lending side of RHEA.",
        hint: "Think of an animal's underground home.",
        activityOf: "rhea",
      },
      {
        prompt: "On a lending market, what do you call the tokens you deposit to secure a loan? (one word)",
        answers: ["collateral"],
        reveal: "Collateral: what you put up so you can borrow.",
        hint: "It's what you put up so you're allowed to borrow.",
        activityOf: "near",
      },
      {
        prompt: "RHEA's swap side is a DEX. What does DEX stand for? (two words)",
        answers: ["decentralized exchange", "decentralised exchange"],
        reveal: "Decentralized exchange: trading without a middleman.",
        hint: "An exchange with no middleman. The D is for ‘decentralized’.",
        activityOf: "linear",
      },
    ],
  },
  {
    owner: "near",
    title: "Secrets of the NEAR Protocol",
    summary: "Decrypt three NEAR secrets and split 200 USD.",
    description: "How well do you know the chain under NEAR District? Decrypt all three secrets before the deadline to share the prize.",
    prize: 200,
    days: 6,
    secrets: [
      {
        prompt: "What is the name of NEAR's sharding design? (one word)",
        answers: ["Nightshade"],
        reveal: "Nightshade: NEAR splits work across shards so it can scale.",
        hint: "It's a plant name, and also means the dark side of the day.",
        activityOf: "near",
      },
      {
        prompt: "The smallest unit of NEAR is 10^-24 NEAR. What is it called? (one word)",
        answers: ["yoctoNEAR", "yocto"],
        reveal: "yoctoNEAR: one NEAR is 10^24 yoctoNEAR.",
        hint: "It uses the metric prefix for 10^-24.",
        activityOf: "rhea",
      },
      {
        prompt: "Human-readable accounts on NEAR mainnet end with which suffix? (one word, without the dot)",
        answers: ["near", ".near"],
        reveal: ".near, as in alice.near.",
        hint: "Like alice.____",
        activityOf: "linear",
      },
    ],
  },
  {
    owner: "linear",
    title: "The LiNEAR Staking Quest",
    summary: "Learn liquid staking, decrypt three secrets and split 100 USD.",
    description: "Stake smarter on NEAR. Decrypt all three secrets about liquid staking before the deadline to share the prize.",
    prize: 100,
    days: 5,
    secrets: [
      {
        prompt: "When you stake NEAR on LiNEAR Protocol, which token do you receive? (one word)",
        answers: ["LiNEAR", "linear"],
        reveal: "LiNEAR: a liquid token that keeps earning staking rewards.",
        hint: "It shares its name with the protocol.",
        activityOf: "linear",
      },
      {
        prompt: "What is staking called when you get a tradable token back while your NEAR keeps earning? (two words)",
        answers: ["liquid staking"],
        reveal: "Liquid staking: your stake stays usable as a token.",
        hint: "The opposite of ‘locked’ staking.",
        activityOf: "rhea",
      },
      {
        prompt: "NEAR pays staking rewards once per what? (one word)",
        answers: ["epoch", "epochs"],
        reveal: "Epoch: a period of roughly 12 hours on NEAR.",
        hint: "A period of roughly 12 hours on NEAR.",
        activityOf: "near",
      },
    ],
  },
  {
    owner: "social",
    title: "The Social Signal",
    summary: "Two secrets between NEAR Social and RHEA. Split 150 USD.",
    description: "NEAR Social and RHEA hid one secret each. Decrypt both before the deadline to share the prize.",
    prize: 150,
    days: 5,
    secrets: [
      {
        prompt: "On NEAR Social, what are the small apps people build and share called? (one word)",
        answers: ["widgets", "widget", "components", "component"],
        reveal: "Widgets (also called components): small apps stored on-chain that anyone can fork.",
        hint: "Little building blocks you can drop into a page. Think “w…”.",
        activityOf: "social",
      },
      {
        prompt: "Which NEAR DeFi app lets you swap, lend and borrow in one place? (one word)",
        answers: ["RHEA", "RHEA Finance"],
        reveal: "RHEA Finance: swap, lend and borrow in one app.",
        hint: "A Greek goddess… and the first partner on this map.",
        activityOf: "rhea",
      },
    ],
  },
];

if (ONCHAIN) {
  HUNTS.push({
    owner: "near",
    title: "Warm-up: First Steps on NEAR",
    summary: "A quick two-secret warm-up. Split 20 USD.",
    description: "A short warm-up mission that ends minutes after it opens, so you can watch the prize vault pay winners automatically.",
    prize: 20,
    days: 0,
    minutes: Number(process.env.WARMUP_MINUTES ?? 8),
    secrets: [
      { prompt: "What is the smallest unit of NEAR called? (one word)", answers: ["yoctoNEAR", "yocto"], reveal: "yoctoNEAR: 10^-24 NEAR.", hint: "Its prefix means 10^-24.", activityOf: "near" },
      { prompt: "NEAR wraps native NEAR into a fungible token. What is that token called? (one word)", answers: ["wNEAR"], reveal: "wNEAR: wrapped NEAR.", hint: "Put a 'w' in front of it.", activityOf: "near" },
    ],
  });
}

async function owner(name: string, account: string): Promise<SessionUser> {
  const [u] = await db.insert(users).values({ displayName: name }).returning();
  await db.execute(
    sql`insert into wallet_connections (user_id, network, account_id, public_key, is_payout, verified_at)
        values (${u!.id}, ${network}, ${account}, 'ed25519:demo-fixture-not-a-real-key', true, now())`,
  );
  return { sessionId: "seed", userId: u!.id, displayName: name, email: null, status: "active", walletVerifiedAt: new Date(), payoutAccountId: account, adminRoles: [] };
}

const question = (s: Secret): QuestionInput =>
  ({ type: "short_text", prompt: s.prompt, answers: s.answers, revealText: s.reveal, caseSensitive: false, stripPunctuation: true, difficulty: 1, maxAttempts: 100, cooldownSeconds: 0, numericTolerance: "0" }) as QuestionInput;

// 1) companies (approved, with logos)
const made = new Map<Key, { me: SessionUser; spaceId: string; orgId: string }>();
for (const co of COMPANIES) {
  const me = await owner(`${co.org} team`, co.account);
  const { space } = await createSpace(db, me, {
    organizationName: co.org,
    name: co.org,
    slug: co.slug,
    category: co.category,
    tagline: co.tagline,
    description: co.description,
    websiteUrl: co.website,
    socials: {},
    buildingStyle: co.style,
  });
  const logoBytes = readFileSync(fileURLToPath(new URL(`./demo-logos/${co.logo}`, import.meta.url)));
  const logo = LIVE
    ? (
        await db
          .insert(uploads)
          .values({ ownerUserId: me.userId, organizationId: space.organizationId, purpose: "logo", storageKey: `static:/assets/demo-logos/${co.logo}`, mimeType: "image/png", byteSize: logoBytes.length, sha256: createHash("sha256").update(logoBytes).digest("hex"), moderation: "approved" })
          .returning()
      )[0]!
    : await storeImage(db, { userId: me.userId, organizationId: space.organizationId, purpose: "logo", data: logoBytes });
  await db.update(spaces).set({ moderation: "approved", logoUploadId: logo.id }).where(eq(spaces.id, space.id));
  await db.update(organizations).set({ status: "approved" }).where(eq(organizations.id, space.organizationId));
  made.set(co.key, { me, spaceId: space.id, orgId: space.organizationId });
}

// 2) hunts: three secrets, one hint each (own activity, then two partners)
let warmup: { id: string; endsAt: Date } | null = null;
for (const hunt of HUNTS) {
  const o = made.get(hunt.owner)!;
  const c = await createDraft(db, o.me, o.spaceId, { template: "treasure_hunt", title: hunt.title });
  for (const s of hunt.secrets) await addQuestion(db, o.me, c, question(s));
  const qs = await listQuestions(db, c.id);
  for (const [i, s] of hunt.secrets.entries()) {
    const partner = s.activityOf !== hunt.owner ? COMPANIES.find((x) => x.key === s.activityOf)! : null;
    const act = ACTIVITY[s.activityOf];
    await saveHint(db, o.me, c, {
      questionId: qs[i]!.id,
      title: "Hint",
      teaser: "",
      content: s.hint,
      unlock: {
        kind: "group",
        op: "ANY",
        children: [
          {
            kind: "activity",
            id: "unlock",
            ownerOrgId: o.orgId,
            activity: { type: "near_contract_call", network, ...act, ...(partner ? { partner: { name: partner.org, url: partner.website } } : {}) },
          },
        ],
      },
      withdrawalPolicy: "disable",
    });
  }
  const endsAt = new Date(Date.now() + (hunt.minutes ? hunt.minutes * 60_000 : hunt.days * DAY));
  await updateCampaign(db, o.me, c, {
    summary: hunt.summary,
    description: hunt.description,
    rules: {
      startsAt: new Date(Date.now() - (hunt.minutes ? 2 * 3_600_000 : 60_000)).toISOString(),
      endsAt: endsAt.toISOString(),
      // on-chain: the prize is locked in the prize vault before publishing; otherwise unfunded and tagged DEMO
      fundingSource: ONCHAIN ? "direct" : "none",
      plannedDirectBudget: USDC(hunt.prize),
      reward: { mode: "equal", winnersCount: 10_000, minPayout: "1", tieBreak: "earliest_completion" },
    },
  });
  let lockTx = "";
  if (ONCHAIN) {
    const { missionId, tx } = await lockPrize(o.me.payoutAccountId!, endsAt, BigInt(USDC(hunt.prize)));
    await db.update(campaigns).set({ vaultCampaignId: missionId }).where(eq(campaigns.id, c.id));
    lockTx = ` · prize locked on-chain (mission ${missionId}, tx ${tx})`;
  }
  const [fresh] = await db.select().from(campaigns).where(eq(campaigns.id, c.id));
  await publishCampaign(db, o.me, fresh!);
  if (hunt.minutes) warmup = { id: c.id, endsAt };
  const partners = hunt.secrets.slice(1).map((s) => COMPANIES.find((x) => x.key === s.activityOf)!.org);
  console.log(`seeded ${hunt.title} (${hunt.prize} USD) · partners: ${partners.join(", ") || "none"}${lockTx}`);
}

// 3) the Demo Explorer: plays with a real testnet wallet; in on-chain mode their warm-up answers are locked in
{
  const [u] = await db.insert(users).values({ displayName: "Demo Explorer" }).returning();
  const account = ONCHAIN ? PLAYER_WALLET : `explorer-demo.${network}`;
  await db.execute(
    sql`insert into wallet_connections (user_id, network, account_id, public_key, is_payout, verified_at)
        values (${u!.id}, ${network}, ${account}, 'ed25519:demo-fixture-not-a-real-key', true, now())`,
  );
  const player: SessionUser = { sessionId: "seed", userId: u!.id, displayName: "Demo Explorer", email: null, status: "active", walletVerifiedAt: new Date(), payoutAccountId: account, adminRoles: [] };
  if (warmup) {
    const [w] = await db.select().from(campaigns).where(eq(campaigns.id, warmup.id));
    await joinCampaign(db, player, w!.id, null);
    const qs = await listQuestions(db, w!.id);
    const answers = ["yoctoNEAR", "wNEAR"];
    for (const [i, q] of qs.entries()) await submitAnswer(db, player, w!.id, q.id, answers[i]!, null);
    console.log(`Demo Explorer (${account}) locked in both warm-up answers; the mission ends ${warmup.endsAt.toLocaleTimeString()} and the worker pays out on-chain after that`);
  } else console.log(`Demo Explorer (${account}) created`);
}

await h.close();
console.log("done");
