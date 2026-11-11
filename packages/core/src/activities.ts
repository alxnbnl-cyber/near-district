/**
 * Activity catalogue and hint-unlock rule engine. Pure and deterministic: no I/O.
 *
 * An activity is something a player does elsewhere (another Space's hunt, a RHEA swap, a reviewed
 * contribution). Completing activities unlocks hints. It NEVER pays out by itself.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { parseUnits } from "./money";

export type VerifierSupport = "automatic" | "manual" | "not_supported";
export type ActivityCategory = "internal" | "onchain" | "partner_app" | "manual";

export type ActivityType =
  | "internal_campaign_completion"
  | "internal_quiz"
  | "internal_question_sequence"
  | "internal_contest_entry"
  | "manual_review"
  | "near_rhea_swap"
  | "near_rhea_lending_supply"
  | "near_stake"
  | "meteor_wallet_signin"

  | "near_liquidity_provision"
  | "near_asset_holding"
  | "near_nft_ownership"
  | "near_contract_interaction"
  | "partner_api_event"
  | "meteor_swap";

export interface CatalogueEntry {
  type: ActivityType;
  category: ActivityCategory;
  label: string;
  description: string;
  support: VerifierSupport;
  /** Why an entry is unavailable (shown in the builder and docs). */
  unsupportedReason?: string;
  /** Involves spending or moving funds; the builder asks for a free alternative path. */
  financial: boolean;
}

export const ACTIVITY_CATALOGUE: readonly CatalogueEntry[] = [
  { type: "internal_campaign_completion", category: "internal", label: "Finish a campaign", description: "Complete a Treasure Hunt or enter a Creative Contest.", support: "automatic", financial: false },
  { type: "internal_quiz", category: "internal", label: "Pass a learning quiz", description: "Finish a Treasure Hunt used as a quiz, optionally with a minimum score.", support: "automatic", financial: false },
  { type: "internal_question_sequence", category: "internal", label: "Solve the first questions", description: "Solve the first N questions of a Treasure Hunt (an earlier chapter).", support: "automatic", financial: false },
  { type: "internal_contest_entry", category: "internal", label: "Submit a contest entry", description: "Submit an entry to a Creative Contest.", support: "automatic", financial: false },
  { type: "manual_review", category: "manual", label: "Reviewed contribution", description: "Feedback, a creative contribution or other work, approved by the activity owner's reviewers.", support: "manual", financial: false },
  { type: "near_rhea_swap", category: "onchain", label: "Swap on RHEA", description: "A finalized swap on the RHEA exchange (v2.ref-finance.near) from a verified wallet.", support: "automatic", financial: true },
  { type: "near_rhea_lending_supply", category: "onchain", label: "Supply to RHEA Lending", description: "A finalized supply to RHEA Lending (contract.main.burrow.near) from a verified wallet.", support: "automatic", financial: true },
  { type: "near_stake", category: "onchain", label: "Stake NEAR", description: "A finalized stake (deposit_and_stake) with a NEAR validator pool from a verified wallet.", support: "automatic", financial: true },
  { type: "meteor_wallet_signin", category: "partner_app", label: "Sign in with Meteor Wallet", description: "Prove a wallet with Meteor Wallet. Ownership is proven by signature; the wallet app is reported by the wallet itself.", support: "automatic", financial: false },
  { type: "near_liquidity_provision", category: "onchain", label: "Provide liquidity", description: "Add liquidity to a pool.", support: "not_supported", unsupportedReason: "No verified adapter for pool-share accounting yet.", financial: true },
  { type: "near_asset_holding", category: "onchain", label: "Hold an asset", description: "Hold a token for a duration.", support: "not_supported", unsupportedReason: "Holding history needs an indexer; point-in-time balances can be borrowed.", financial: true },
  { type: "near_nft_ownership", category: "onchain", label: "Own an NFT", description: "Own an NFT from a collection.", support: "not_supported", unsupportedReason: "No collection registry has been reviewed yet.", financial: false },
  { type: "near_contract_interaction", category: "onchain", label: "Contract interaction", description: "Call an approved contract method.", support: "not_supported", unsupportedReason: "Arbitrary methods aren't accepted; each interaction needs a reviewed adapter.", financial: false },
  { type: "partner_api_event", category: "partner_app", label: "Verified partner app action", description: "A signed event from a partner app.", support: "not_supported", unsupportedReason: "Not offered: NEAR District focuses on on-chain NEAR activity.", financial: false },
  { type: "meteor_swap", category: "partner_app", label: "Swap using Meteor", description: "A swap made inside Meteor Wallet.", support: "not_supported", unsupportedReason: "Meteor routes through other exchanges and leaves no verifiable attribution. Use “Swap on RHEA” instead.", financial: true },
];

export function catalogueEntry(type: string): CatalogueEntry | undefined {
  return ACTIVITY_CATALOGUE.find((e) => e.type === type);
}

// ---------------------------------------------------------------------------- approved assets

/** Exact token contracts approved for on-chain activities. Verified on mainnet 2026-11-09 (ft_metadata, Burrow get_asset). */
export interface ActivityToken {
  contractId: string;
  symbol: string;
  decimals: number;
  /** Burrow internal units = decimals + burrowExtraDecimals; null = not listed on RHEA Lending. */
  burrowExtraDecimals: number | null;
}

export type ActivityNetwork = "mainnet" | "testnet";

/**
 * RHEA contracts per network. Testnet verified 2026-11-11: ref-finance-101.testnet (owner
 * reflabs.sputnikv2.testnet, v1.9.19) and contract.1638481328.burrow.testnet (deposit/withdraw on).
 */
export const RHEA_CONTRACTS: Record<ActivityNetwork, { exchange: string; lending: string }> = {
  mainnet: { exchange: "v2.ref-finance.near", lending: "contract.main.burrow.near" },
  testnet: { exchange: "ref-finance-101.testnet", lending: "contract.1638481328.burrow.testnet" },
};
export const RHEA_MAINNET = RHEA_CONTRACTS.mainnet;

/** Validator staking pools are factory sub-accounts; testnet verified 2026-11-11 (e.g. aurora.pool.f863973.m0). */
export const STAKING_POOL_SUFFIXES: Record<ActivityNetwork, string[]> = {
  mainnet: [".poolv1.near", ".pool.near"],
  testnet: [".pool.f863973.m0"],
};

/** Testnet test tokens listed on testnet Burrow (ft_metadata + get_asset, 2026-11-11). */
export const ACTIVITY_TOKENS_TESTNET: readonly ActivityToken[] = [
  { contractId: "usdc.fakes.testnet", symbol: "USDC.e", decimals: 6, burrowExtraDecimals: 12 },
  { contractId: "usdt.fakes.testnet", symbol: "USDT.e", decimals: 6, burrowExtraDecimals: 12 },
  { contractId: "wrap.testnet", symbol: "wNEAR", decimals: 24, burrowExtraDecimals: 0 },
];

export const ACTIVITY_TOKENS: readonly ActivityToken[] = [
  { contractId: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", symbol: "USDC", decimals: 6, burrowExtraDecimals: 12 },
  { contractId: "usdt.tether-token.near", symbol: "USDt", decimals: 6, burrowExtraDecimals: 12 },
  { contractId: "wrap.near", symbol: "wNEAR", decimals: 24, burrowExtraDecimals: 0 },
  { contractId: "zec.omft.near", symbol: "ZEC", decimals: 8, burrowExtraDecimals: 10 },
  { contractId: "token.rhealab.near", symbol: "RHEA", decimals: 18, burrowExtraDecimals: null },
];

export function activityTokens(network: ActivityNetwork): readonly ActivityToken[] {
  return network === "testnet" ? ACTIVITY_TOKENS_TESTNET : ACTIVITY_TOKENS;
}

/** Contract ids are unique across networks, so without a network both lists are searched. */
export function activityToken(contractId: string, network?: ActivityNetwork): ActivityToken | undefined {
  const pool = network ? activityTokens(network) : [...ACTIVITY_TOKENS, ...ACTIVITY_TOKENS_TESTNET];
  return pool.find((t) => t.contractId === contractId);
}

// ---------------------------------------------------------------------------- activity params

export type ActivityDef =
  | { type: "internal_campaign_completion"; campaignId: string }
  | { type: "internal_quiz"; campaignId: string; minScore?: number }
  | { type: "internal_question_sequence"; campaignId: string; questionCount: number }
  | { type: "internal_contest_entry"; campaignId: string }
  | { type: "manual_review"; instructions: string; requireLink?: boolean }
  | {
      type: "near_rhea_swap";
      network: ActivityNetwork;
      /** Exact token contract ids; omitted = any token on that side. */
      tokenIn?: string;
      tokenOut?: string;
      /** Minimum input amount in the smallest unit of `tokenIn` (requires tokenIn). */
      minAmountIn?: string;
    }
  | {
      type: "near_stake";
      network: ActivityNetwork;
      /** Minimum staked amount in yoctoNEAR. */
      minAmount: string;
    }
  | { type: "meteor_wallet_signin" }
  | {
      type: "near_rhea_lending_supply";
      network: ActivityNetwork;
      tokenId: string;
      /** Minimum supplied amount, smallest token units. */
      minAmount: string;
      /** If set, the position must still hold ≥ minAmount this long after the deposit. */
      minHoldSeconds?: number;
    };

const INT = /^\d{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Structural validation of an activity definition. Returns problems (empty = valid). */
export function validateActivity(a: ActivityDef): string[] {
  const p: string[] = [];
  const entry = catalogueEntry(a.type);
  if (!entry) return [`Unknown activity type "${(a as { type: string }).type}"`];
  if (entry.support === "not_supported") return [`${entry.label} isn't supported yet: ${entry.unsupportedReason}`];
  switch (a.type) {
    case "internal_campaign_completion":
    case "internal_contest_entry":
      if (!UUID.test(a.campaignId)) p.push("Pick a campaign.");
      break;
    case "internal_quiz":
      if (!UUID.test(a.campaignId)) p.push("Pick a quiz campaign.");
      if (a.minScore !== undefined && (!Number.isInteger(a.minScore) || a.minScore < 0)) p.push("Minimum score must be a whole number.");
      break;
    case "internal_question_sequence":
      if (!UUID.test(a.campaignId)) p.push("Pick a campaign.");
      if (!Number.isInteger(a.questionCount) || a.questionCount < 1 || a.questionCount > 50) p.push("Question count must be 1–50.");
      break;
    case "manual_review":
      if (!a.instructions?.trim() || a.instructions.length > 1000) p.push("Explain what the player should submit (up to 1000 characters).");
      break;
    case "near_rhea_swap":
      if (a.network !== "mainnet" && a.network !== "testnet") p.push("Unknown NEAR network.");
      if (a.tokenIn && !activityToken(a.tokenIn, a.network)) p.push("Input token isn't on the approved list.");
      if (a.tokenOut && !activityToken(a.tokenOut, a.network)) p.push("Output token isn't on the approved list.");
      if (a.tokenIn && a.tokenOut && a.tokenIn === a.tokenOut) p.push("Input and output tokens must differ.");
      if (a.minAmountIn !== undefined) {
        if (!a.tokenIn) p.push("A minimum amount needs a specific input token.");
        if (!INT.test(a.minAmountIn)) p.push("Minimum amount must be a whole number of the token's smallest unit.");
      }
      break;
    case "near_stake":
      if (a.network !== "mainnet" && a.network !== "testnet") p.push("Unknown NEAR network.");
      if (!INT.test(a.minAmount) || BigInt(a.minAmount) === 0n) p.push("Set a minimum stake above zero.");
      break;
    case "meteor_wallet_signin":
      break;
    case "near_rhea_lending_supply": {
      if (a.network !== "mainnet" && a.network !== "testnet") p.push("Unknown NEAR network.");
      const t = activityToken(a.tokenId, a.network);
      if (!t) p.push("Token isn't on the approved list.");
      else if (t.burrowExtraDecimals === null) p.push(`${t.symbol} isn't listed on RHEA Lending.`);
      if (!INT.test(a.minAmount) || BigInt(a.minAmount) === 0n) p.push("Set a minimum supply amount above zero.");
      if (a.minHoldSeconds !== undefined && (!Number.isInteger(a.minHoldSeconds) || a.minHoldSeconds < 0 || a.minHoldSeconds > 90 * 86_400)) {
        p.push("Holding period must be between 0 and 90 days.");
      }
      break;
    }
  }
  return p;
}

/** Human amount → smallest units for an approved token ("12.5" USDC → "12500000"). */
export function toTokenUnits(contractId: string, human: string): string {
  const t = activityToken(contractId);
  if (!t) throw new Error("Token isn't approved");
  return parseUnits(human, t.decimals).toString();
}

/** One-line description of what the player must do. */
export function describeActivity(a: ActivityDef, names: { campaign?: (id: string) => string | undefined } = {}): string {
  const camp = (id: string) => names.campaign?.(id) ?? "a campaign";
  const tok = (id?: string) => (id ? (activityToken(id)?.symbol ?? id) : "any token");
  const amt = (id: string | undefined, v: string | undefined) => {
    const t = id ? activityToken(id) : undefined;
    if (!t || !v) return "";
    const s = BigInt(v).toString().padStart(t.decimals + 1, "0");
    const whole = s.slice(0, -t.decimals) || "0";
    const frac = s.slice(-t.decimals).replace(/0+$/, "");
    return `${whole}${frac ? `.${frac}` : ""} ${t.symbol}`;
  };
  switch (a.type) {
    case "internal_campaign_completion":
      return `Finish “${camp(a.campaignId)}”`;
    case "internal_quiz":
      return `Pass “${camp(a.campaignId)}”${a.minScore ? ` with at least ${a.minScore} points` : ""}`;
    case "internal_question_sequence":
      return `Solve the first ${a.questionCount} question${a.questionCount === 1 ? "" : "s"} of “${camp(a.campaignId)}”`;
    case "internal_contest_entry":
      return `Submit an entry to “${camp(a.campaignId)}”`;
    case "manual_review":
      return a.instructions;
    case "near_rhea_swap":
      return `Swap ${a.minAmountIn ? `at least ${amt(a.tokenIn, a.minAmountIn)}` : tok(a.tokenIn)} for ${tok(a.tokenOut)} on RHEA`;
    case "near_stake": {
      const s = BigInt(a.minAmount).toString().padStart(25, "0");
      const whole = s.slice(0, -24) || "0";
      const frac = s.slice(-24).replace(/0+$/, "");
      return `Stake at least ${whole}${frac ? `.${frac}` : ""} NEAR with a validator`;
    }
    case "meteor_wallet_signin":
      return "Sign in with Meteor Wallet";
    case "near_rhea_lending_supply":
      return `Supply at least ${amt(a.tokenId, a.minAmount)} to RHEA Lending${a.minHoldSeconds ? ` and keep it for ${Math.round(a.minHoldSeconds / 3600)}h` : ""}`;
  }
}

// ---------------------------------------------------------------------------- rule tree

export type RuleOp = "ANY" | "ALL";
/** Reserved for later; never accepted by validateRule until they have their own tests. */
export const FUTURE_OPS = ["COUNT", "SEQUENCE"] as const;

export interface ActivityLeaf {
  kind: "activity";
  /** Stable id within the hint (a–z, 0–9, -). */
  id: string;
  activity: ActivityDef;
  /** Organization that owns (and for manual review, reviews) the activity. */
  ownerOrgId: string;
  /** Set when the activity comes from a partner's offering. */
  offeringId?: string;
}

export interface RuleGroup {
  kind: "group";
  op: RuleOp;
  children: RuleNode[];
}

export type RuleNode = RuleGroup | ActivityLeaf;

const LEAF_ID = /^[a-z0-9-]{1,32}$/;
export const MAX_RULE_DEPTH = 3;
export const MAX_RULE_LEAVES = 8;

export function leaves(node: RuleNode): ActivityLeaf[] {
  return node.kind === "activity" ? [node] : node.children.flatMap(leaves);
}

export function validateRule(node: RuleNode): string[] {
  const problems: string[] = [];
  const walk = (n: RuleNode, depth: number) => {
    if (depth > MAX_RULE_DEPTH) problems.push(`Rules can be nested at most ${MAX_RULE_DEPTH} levels deep.`);
    if (n.kind === "group") {
      if (n.op !== "ANY" && n.op !== "ALL") problems.push(`Operator ${String(n.op)} isn't available.`);
      if (n.children.length === 0) problems.push("A rule group needs at least one activity.");
      n.children.forEach((c) => walk(c, depth + 1));
    } else if (n.kind === "activity") {
      if (!LEAF_ID.test(n.id)) problems.push("Invalid requirement id.");
      if (!UUID.test(n.ownerOrgId)) problems.push("Requirement has no owning organization.");
      problems.push(...validateActivity(n.activity));
    } else problems.push("Unknown rule node.");
  };
  walk(node, 1);
  const ls = leaves(node);
  if (ls.length > MAX_RULE_LEAVES) problems.push(`A hint can have at most ${MAX_RULE_LEAVES} activities.`);
  if (new Set(ls.map((l) => l.id)).size !== ls.length) problems.push("Requirement ids must be unique.");
  return [...new Set(problems)];
}

/** Server-side evaluation against the set of verified requirement ids. */
export function evaluateRule(node: RuleNode, completed: ReadonlySet<string>): boolean {
  if (node.kind === "activity") return completed.has(node.id);
  if (node.op === "ALL") return node.children.every((c) => evaluateRule(c, completed));
  if (node.op === "ANY") return node.children.some((c) => evaluateRule(c, completed));
  return false; // unknown operators never unlock
}

/** True when at least one path to unlocking needs no financial activity. */
export function hasFreePath(node: RuleNode): boolean {
  if (node.kind === "activity") return !catalogueEntry(node.activity.type)?.financial;
  return node.op === "ANY" ? node.children.some(hasFreePath) : node.children.every(hasFreePath);
}

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export function definitionHash(v: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(stableStringify(v))));
}
