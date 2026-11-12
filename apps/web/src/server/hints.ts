import "server-only";
import {
  activityOfferings,
  activityVerifications,
  and,
  asc,
  campaigns,
  eq,
  HintEngineError,
  hintAvailability,
  hintProgress,
  hintQuestionPosition,
  inArray,
  lt,
  organizations,
  participantEntries,
  partnershipAccepted,
  processVerification,
  requestVerification,
  revealFreeHint,
  reviewVerification,
  spaces,
  treasureHints,
  treasureQuestions,
  users,
  type Db,
  type EngineDeps,
  type OnchainPort,
} from "@yielvy/db";
import {
  ACTIVITY_CATALOGUE,
  activityTokens,
  catalogueEntry,
  definitionHash,
  describeActivity,
  hasFreePath,
  leaves,
  validateRule,
  type ActivityDef,
  type CampaignRules,
  type RuleNode,
} from "@yielvy/core";
import { NearActivityVerifier, NearBlocksIndexer, NearRpc, archivalRpcUrls, dispatchOnchain } from "@yielvy/near";
import type { HintInput } from "@/lib/hint-schemas";
import { audit } from "./audit";
import { conflict, badRequest, HttpError, notFound, forbidden } from "./http";
import { env } from "./env";
import { nearRpc } from "./near";
import { assertActivityOwnership, campaignNames, partnerOfferings } from "./partners";
import { rateLimit } from "./rate-limit";
import { currentRules, effectiveStatus } from "./campaigns";
import type { SessionUser } from "./session";

export const MAX_HINTS_PER_QUESTION = 4;

/** On-chain RHEA activities are verified on this deployment's network (mainnet or testnet). */
export function onchainEnabled(): boolean {
  return true;
}

export function engineDeps(): EngineDeps {
  let onchain: OnchainPort | null = null;
  if (onchainEnabled()) {
    const v = NearActivityVerifier.forNetwork(nearRpc(), env().NEAR_NETWORK);
    onchain = {
      verify: dispatchOnchain(v, {
        indexer: new NearBlocksIndexer({ apiKey: env().NEARBLOCKS_API_KEY }),
        archive: new NearRpc({ urls: archivalRpcUrls(env().NEAR_NETWORK, env().NEAR_ARCHIVAL_RPC_URLS) }),
      }),
    };
  }
  return { walletNetwork: env().NEAR_NETWORK, onchain };
}

/** Maps engine errors to HTTP errors for routes. */
export async function engine<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof HintEngineError) throw new HttpError(e.status, e.message, e.code);
    throw e;
  }
}

type CampaignRow = typeof campaigns.$inferSelect;

async function orgOfCampaign(db: Db, c: CampaignRow) {
  const [s] = await db.select({ org: spaces.organizationId }).from(spaces).where(eq(spaces.id, c.spaceId)).limit(1);
  return s!.org;
}

function assertEditable(c: CampaignRow) {
  if (c.status !== "DRAFT" && c.status !== "PENDING_FUNDING") throw conflict("Hints are locked once a mission is published, so every player sees the same secrets.");
  if (c.template !== "treasure_hunt") throw badRequest("Only Treasure Hunts have hints.");
}

/**
 * Normalizes and validates an unlock rule for a campaign:
 *  - own activities are owned by the campaign's organization and may only use its campaigns,
 *  - partner activities must come from an ACTIVE offering of an organization with an ACCEPTED
 *    partnership; the offering's definition replaces whatever the client sent (no impersonation).
 */
export async function normalizeRule(db: Db, c: CampaignRow, rule: RuleNode): Promise<RuleNode> {
  const org = await orgOfCampaign(db, c);
  const walk = async (n: RuleNode): Promise<RuleNode> => {
    if (n.kind === "group") return { kind: "group", op: n.op, children: await Promise.all(n.children.map(walk)) };
    if (n.offeringId) {
      const [o] = await db.select().from(activityOfferings).where(eq(activityOfferings.id, n.offeringId)).limit(1);
      if (!o || o.status !== "active") throw badRequest("That partner activity is no longer offered.");
      if (o.organizationId !== org && !(await partnershipAccepted(db, org, o.organizationId))) throw forbidden("You can only use activities from accepted partners.");
      return { kind: "activity", id: n.id, activity: o.activity as ActivityDef, ownerOrgId: o.organizationId, offeringId: o.id };
    }
    await assertActivityOwnership(db, org, n.activity, c.id);
    return { kind: "activity", id: n.id, activity: n.activity, ownerOrgId: org };
  };
  const out = await walk(rule);
  const problems = validateRule(out);
  if (problems.length) throw badRequest(problems[0]!);
  if (!onchainEnabled() && leaves(out).some((l) => l.activity.type.startsWith("near_"))) {
    throw badRequest("On-chain activities can only be verified on a mainnet deployment.");
  }
  return out;
}

function hintHash(h: { title: string; content: string; unlock: RuleNode | null; availableFrom: Date | null; availableUntil: Date | null; withdrawalPolicy: string }) {
  return definitionHash({ ...h, availableFrom: h.availableFrom?.toISOString() ?? null, availableUntil: h.availableUntil?.toISOString() ?? null });
}

export async function saveHint(db: Db, user: SessionUser, c: CampaignRow, input: HintInput, hintId?: string) {
  assertEditable(c);
  const [q] = await db.select({ id: treasureQuestions.id, position: treasureQuestions.position }).from(treasureQuestions).where(and(eq(treasureQuestions.id, input.questionId), eq(treasureQuestions.campaignId, c.id))).limit(1);
  if (!q) throw notFound("Question not found.");
  const unlock = input.unlock ? await normalizeRule(db, c, input.unlock) : null;
  // partners are linked on the second and third secrets only
  if (unlock && leaves(unlock).some((l) => "partner" in l.activity && l.activity.partner)) {
    const earlier = await db.select({ id: treasureQuestions.id }).from(treasureQuestions).where(and(eq(treasureQuestions.campaignId, c.id), lt(treasureQuestions.position, q.position)));
    if (earlier.length !== 1 && earlier.length !== 2) throw badRequest("A partner can only be linked on the second or third secret.");
  }
  const availableFrom = input.availableFrom ? new Date(input.availableFrom) : null;
  const availableUntil = input.availableUntil ? new Date(input.availableUntil) : null;
  if (availableFrom && availableUntil && availableUntil <= availableFrom) throw badRequest("The hint must close after it opens.");
  const values = {
    title: input.title,
    teaser: input.teaser ?? "",
    content: input.content,
    imageUploadId: input.imageUploadId ?? null,
    unlock,
    availableFrom,
    availableUntil,
    withdrawalPolicy: input.withdrawalPolicy,
  };
  const rulesHash = hintHash(values);
  if (hintId) {
    const res = await db
      .update(treasureHints)
      .set({ ...values, rulesHash, updatedAt: new Date() })
      .where(and(eq(treasureHints.id, hintId), eq(treasureHints.campaignId, c.id)))
      .returning({ id: treasureHints.id });
    if (!res.length) throw notFound("Hint not found.");
    await audit(db, { actorUserId: user.userId, action: "hint.updated", targetType: "campaign", targetId: c.id, metadata: { hintId, rulesHash } });
    return { id: hintId };
  }
  return db.transaction(async (tx) => {
    const existing = await tx.select({ position: treasureHints.position }).from(treasureHints).where(eq(treasureHints.questionId, q.id));
    if (existing.length >= MAX_HINTS_PER_QUESTION) throw badRequest(`A question can have at most ${MAX_HINTS_PER_QUESTION} hints.`);
    const position = existing.length ? Math.max(...existing.map((e) => e.position)) + 1 : 0;
    const [row] = await tx.insert(treasureHints).values({ ...values, questionId: q.id, campaignId: c.id, position, rulesHash }).returning({ id: treasureHints.id });
    await audit(tx, { actorUserId: user.userId, action: "hint.added", targetType: "campaign", targetId: c.id, metadata: { hintId: row!.id, rulesHash } });
    return row!;
  });
}

export async function deleteHint(db: Db, user: SessionUser, c: CampaignRow, hintId: string) {
  assertEditable(c);
  const res = await db.delete(treasureHints).where(and(eq(treasureHints.id, hintId), eq(treasureHints.campaignId, c.id))).returning({ id: treasureHints.id });
  if (!res.length) throw notFound("Hint not found.");
  await audit(db, { actorUserId: user.userId, action: "hint.deleted", targetType: "campaign", targetId: c.id, metadata: { hintId } });
}

/** Organizer view: full hint definitions (including secret content) for the campaign's own team. */
export async function listHints(db: Db, campaignId: string) {
  const rows = await db.select().from(treasureHints).where(eq(treasureHints.campaignId, campaignId)).orderBy(asc(treasureHints.position));
  const ids = rows.flatMap((h) => (h.unlock ? leaves(h.unlock as RuleNode).flatMap((l) => ("campaignId" in l.activity ? [l.activity.campaignId] : [])) : []));
  const names = await campaignNames(db, ids);
  const now = new Date();
  return Promise.all(
    rows.map(async (h) => ({
      ...h,
      availability: await hintAvailability(db, h, now),
      requirements: h.unlock ? leaves(h.unlock as RuleNode).map((l) => ({ id: l.id, label: describeActivity(l.activity, { campaign: (id) => names.get(id) }), type: l.activity.type, partner: Boolean(l.offeringId) })) : [],
      freePath: h.unlock ? hasFreePath(h.unlock as RuleNode) : true,
    })),
  );
}

/** Everything the builder needs. Only supported verifiers are selectable. */
export async function orgBuilderOptions(db: Db, orgId: string, excludeCampaignId?: string) {
  const own = await db
    .select({ id: campaigns.id, title: campaigns.title, template: campaigns.template, status: campaigns.status })
    .from(campaigns)
    .innerJoin(spaces, eq(spaces.id, campaigns.spaceId))
    .where(eq(spaces.organizationId, orgId));
  const onchain = onchainEnabled();
  return {
    catalogue: ACTIVITY_CATALOGUE.map((e) => ({
      ...e,
      // one activity for now: a smart contract function call; the rest are shown as coming soon
      available: e.type === "near_contract_call" && onchain,
      unavailableReason: e.type === "near_contract_call" ? undefined : "Coming soon",
    })),
    ownCampaigns: own.filter((x) => x.id !== excludeCampaignId),
    partnerOfferings: await partnerOfferings(db, orgId),
    tokens: activityTokens(env().NEAR_NETWORK),
    network: env().NEAR_NETWORK,
    onchainEnabled: onchain,
  };
}

export async function builderOptions(db: Db, c: CampaignRow) {
  return orgBuilderOptions(db, await orgOfCampaign(db, c), c.id);
}

/** Publish-time validation of every hint (partners still accepted, references published, fairness). */
export async function hintPublishProblems(db: Db, c: CampaignRow, fundingSource: string): Promise<{ problems: string[]; warnings: string[] }> {
  const problems: string[] = [];
  const warnings: string[] = [];
  const rows = await db.select().from(treasureHints).where(eq(treasureHints.campaignId, c.id));
  const now = new Date();
  for (const h of rows) {
    if (!h.unlock) continue;
    const rule = h.unlock as RuleNode;
    const ruleProblems = validateRule(rule);
    if (ruleProblems.length) problems.push(`Hint “${h.title}”: ${ruleProblems[0]}`);
    const avail = await hintAvailability(db, h, now);
    if (avail.state === "partner_withdrawn") problems.push(`Hint “${h.title}” uses a partner activity that is no longer offered.`);
    for (const l of leaves(rule)) {
      const entry = catalogueEntry(l.activity.type);
      if (!entry || entry.support === "not_supported") problems.push(`Hint “${h.title}” uses an unsupported activity.`);
      if (l.activity.type.startsWith("near_") && !onchainEnabled()) problems.push(`Hint “${h.title}” needs a mainnet deployment for on-chain verification.`);
      if ("campaignId" in l.activity) {
        const [t] = await db.select({ v: campaigns.currentVersion, title: campaigns.title }).from(campaigns).where(eq(campaigns.id, l.activity.campaignId)).limit(1);
        if (!t?.v) problems.push(`Hint “${h.title}” points to “${t?.title ?? "a mission"}”, which isn't published yet.`);
      }
    }
    if (!hasFreePath(rule)) {
      const msg = `Hint “${h.title}” can only be unlocked with a financial activity. Add a free alternative (ANY) so no one has to spend to get help.`;
      if (fundingSource !== "none") problems.push(msg);
      else warnings.push(msg);
    }
  }
  return { problems, warnings };
}

// ---------------------------------------------------------------------------- player

export type HintStatus = "LOCKED" | "AVAILABLE" | "PENDING_VERIFICATION" | "UNDER_REVIEW" | "UNLOCKED" | "FAILED";

export interface HintRequirementView {
  id: string;
  label: string;
  type: string;
  category: string;
  /** "discover": on-chain, found automatically from the player's wallet (no tx hash needed). */
  verification: "automatic" | "onchain" | "discover" | "manual";
  /** Contract-call details shown to the player. */
  contract: { contractId: string; methodName: string; description: string | null; partner: { name: string; url: string } | null } | null;
  provider: { orgName: string; spaceSlug: string | null; spaceName: string | null };
  target: { spaceSlug: string; campaignSlug: string; title: string } | null;
  status: "TODO" | "PENDING_VERIFICATION" | "UNDER_REVIEW" | "VERIFIED" | "FAILED";
  reason: string | null;
  reviewNote: string | null;
  instructions: string | null;
  requireLink: boolean;
}

export interface HintCardView {
  id: string;
  title: string;
  teaser: string;
  status: HintStatus;
  op: "ANY" | "ALL" | null;
  free: boolean;
  lockReason: "not_yet" | "expired" | "partner_withdrawn" | null;
  availableFrom: string | null;
  content: string | null;
  imageUrl: string | null;
  requirements: HintRequirementView[];
}

const REASON_TEXT: Record<string, string> = {
  not_completed: "Not finished yet.",
  not_started: "You haven't started it yet.",
  sequence_incomplete: "Keep going: not enough questions solved yet.",
  score_below_minimum: "Finished, but below the minimum score.",
  no_entry: "No entry found yet.",
  campaign_unavailable: "That mission isn't available.",
  invalid_tx_hash: "That doesn't look like a NEAR transaction hash.",
  signer_not_verified_wallet: "That transaction wasn't signed by a wallet you've verified.",
  tx_not_found_for_wallet: "We couldn't find that transaction for your verified wallets.",
  no_successful_rhea_swap: "No successful RHEA swap in that transaction.",
  swap_does_not_match_requirement: "The swap doesn't match the tokens or amount required.",
  no_successful_lending_deposit: "No successful RHEA Lending supply in that transaction.",
  amount_below_minimum: "The supplied amount is below the minimum.",
  outside_time_window: "That activity happened outside the mission's time window.",
  position_not_held: "The position wasn't kept for the holding period.",
  evidence_reused: "That transaction was already used for another requirement in this mission.",
  mainnet_wallet_required: "Verify a NEAR wallet first.",
  no_successful_stake: "No successful stake with a validator in that transaction.",
  wrong_contract: "That transaction didn't call the required contract.",
  wrong_method: "That transaction called a different function.",
  transaction_failed: "That transaction failed on chain.",
  not_found: "No matching transaction from your wallet yet. Do the activity, wait a few seconds, then verify again.",
  indexer_unavailable: "We couldn't search your wallet history just now; we'll keep checking.",
  wrong_program: "That transaction didn't use the required program.",
  tx_failed: "That transaction failed on chain.",
  no_event_yet: "No event from the app yet. Enter your code there, then check again.",
  no_meteor_wallet: "Sign in or link a wallet using Meteor Wallet first.",
  network_mismatch: "This activity is on a different NEAR network than this app.",
  no_verified_wallet: "Verify a NEAR wallet in your profile first.",
  rejected_by_reviewer: "The reviewers didn't approve this submission.",
  not_final: "Waiting for the transaction to be final.",
  rpc_unavailable: "The NEAR network is slow to respond; we'll keep checking.",
  holding_period: "Holding period in progress; we'll re-check automatically.",
};
export const reasonText = (r: string | null) => (r ? (REASON_TEXT[r] ?? REASON_TEXT[r.split(":")[0]!] ?? "Verification didn't succeed.") : null);

/** Hint cards for one question. Locked content never leaves the server. */
export async function hintCards(db: Db, userId: string, questionId: string): Promise<HintCardView[]> {
  const rows = await db.select().from(treasureHints).where(eq(treasureHints.questionId, questionId)).orderBy(asc(treasureHints.position));
  if (!rows.length) return [];
  const progress = await hintProgress(db, userId, rows.map((h) => h.id));
  const allLeaves = rows.flatMap((h) => (h.unlock ? leaves(h.unlock as RuleNode) : []));
  const orgIds = [...new Set(allLeaves.map((l) => l.ownerOrgId))];
  const orgs = orgIds.length
    ? await db.select({ id: organizations.id, name: organizations.name, spaceSlug: spaces.slug, spaceName: spaces.name }).from(organizations).leftJoin(spaces, eq(spaces.organizationId, organizations.id)).where(inArray(organizations.id, orgIds))
    : [];
  const campIds = [...new Set(allLeaves.flatMap((l) => ("campaignId" in l.activity ? [l.activity.campaignId] : [])))];
  const targets = campIds.length
    ? await db.select({ id: campaigns.id, slug: campaigns.slug, title: campaigns.title, spaceSlug: spaces.slug }).from(campaigns).innerJoin(spaces, eq(spaces.id, campaigns.spaceId)).where(inArray(campaigns.id, campIds))
    : [];
  const now = new Date();
  return Promise.all(
    rows.map(async (h): Promise<HintCardView> => {
      const rule = h.unlock as RuleNode | null;
      const avail = await hintAvailability(db, h, now);
      const unlocked = progress.unlocks.some((u) => u.hintId === h.id);
      const reqs: HintRequirementView[] = (rule ? leaves(rule) : []).map((l) => {
        const done = progress.completions.some((c) => c.hintId === h.id && c.leafId === l.id);
        const last = progress.verifications.find((v) => v.hintId === h.id && v.leafId === l.id);
        const o = orgs.find((x) => x.id === l.ownerOrgId);
        const t = "campaignId" in l.activity ? targets.find((x) => x.id === (l.activity as { campaignId: string }).campaignId) : undefined;
        const entry = catalogueEntry(l.activity.type);
        return {
          id: l.id,
          label: describeActivity(l.activity, { campaign: (id) => targets.find((x) => x.id === id)?.title }),
          type: l.activity.type,
          category: entry?.category ?? "internal",
          verification: l.activity.type === "near_contract_call" ? "discover" : entry?.category === "onchain" ? "onchain" : entry?.support === "manual" ? "manual" : "automatic",
          contract: l.activity.type === "near_contract_call" ? { contractId: l.activity.contractId, methodName: l.activity.methodName, description: l.activity.description ?? null, partner: l.activity.partner ?? null } : null,
          provider: { orgName: o?.name ?? "Unknown", spaceSlug: o?.spaceSlug ?? null, spaceName: o?.spaceName ?? null },
          target: t ? { spaceSlug: t.spaceSlug, campaignSlug: t.slug, title: t.title } : null,
          status: done ? "VERIFIED" : last?.status === "pending" ? "PENDING_VERIFICATION" : last?.status === "under_review" ? "UNDER_REVIEW" : last?.status === "failed" ? "FAILED" : "TODO",
          reason: !done && last ? reasonText(last.reasonCode) : null,
          reviewNote: last?.status === "failed" && last.reasonCode === "rejected_by_reviewer" ? last.reviewNote : null,
          instructions: l.activity.type === "manual_review" ? l.activity.instructions : null,
          requireLink: l.activity.type === "manual_review" ? Boolean(l.activity.requireLink) : false,
        };
      });
      const free = rule === null || avail.freeByPolicy;
      let status: HintStatus;
      if (unlocked) status = "UNLOCKED";
      else if (avail.state !== "open" && !avail.freeByPolicy) status = "LOCKED";
      else if (free) status = "AVAILABLE";
      else if (reqs.some((r) => r.status === "PENDING_VERIFICATION")) status = "PENDING_VERIFICATION";
      else if (reqs.some((r) => r.status === "UNDER_REVIEW")) status = "UNDER_REVIEW";
      else if (reqs.some((r) => r.status === "FAILED") && !reqs.some((r) => r.status === "VERIFIED")) status = "FAILED";
      else status = "LOCKED";
      return {
        id: h.id,
        title: h.title,
        teaser: h.teaser,
        status,
        op: rule ? (rule.kind === "group" ? rule.op : "ALL") : null,
        free,
        lockReason: avail.state === "open" || avail.freeByPolicy ? null : avail.state,
        availableFrom: h.availableFrom?.toISOString() ?? null,
        content: unlocked ? h.content : null,
        imageUrl: unlocked && h.imageUploadId ? `/api/uploads/${h.imageUploadId}` : null,
        requirements: reqs,
      };
    }),
  );
}

/** Players may work on hints of any clue, in a live hunt they joined. */
async function assertPlayerAccess(db: Db, user: SessionUser, campaignId: string, hintId: string) {
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!c || !c.currentVersion || c.moderation !== "approved") throw notFound("Mission not found.");
  if (effectiveStatus(c as never) !== "LIVE") throw conflict("This mission isn't open right now.");
  const pos = await hintQuestionPosition(db, hintId);
  if (!pos || pos.campaignId !== c.id) throw notFound("Hint not found.");
  const [e] = await db.select().from(participantEntries).where(and(eq(participantEntries.campaignId, c.id), eq(participantEntries.userId, user.userId))).limit(1);
  if (!e) throw badRequest("Start the mission first.");
  if (e.status !== "in_progress") throw conflict("You've already finished this mission.");
  // sealed hunts show every clue at once, so any clue's hints can be worked on once the player has joined
  void pos.position;
  const [q] = await db.select({ questionId: treasureHints.questionId }).from(treasureHints).where(eq(treasureHints.id, hintId)).limit(1);
  return { campaign: c, questionId: q!.questionId };
}

export async function verifyHintActivity(db: Db, user: SessionUser, campaignId: string, hintId: string, input: { leafId: string; txHash?: string; submission?: { text: string; link?: string } }) {
  await rateLimit(db, `verify:u:${user.userId}`, 30, 60);
  await rateLimit(db, `verify:l:${user.userId}:${hintId}:${input.leafId}`, 6, 60);
  const { questionId } = await assertPlayerAccess(db, user, campaignId, hintId);
  const outcome = await engine(requestVerification(db, engineDeps(), { userId: user.userId, hintId, leafId: input.leafId, txHash: input.txHash?.trim(), submission: input.submission }));
  await audit(db, { actorUserId: user.userId, action: "activity.verify_requested", targetType: "hint", targetId: hintId, metadata: { leafId: input.leafId, status: outcome.status, reason: outcome.reason } });
  return { outcome: { ...outcome, message: reasonText(outcome.reason) }, hints: await hintCards(db, user.userId, questionId) };
}

export async function revealHint(db: Db, user: SessionUser, campaignId: string, hintId: string) {
  await rateLimit(db, `reveal:u:${user.userId}`, 30, 60);
  const { questionId } = await assertPlayerAccess(db, user, campaignId, hintId);
  await engine(revealFreeHint(db, user.userId, hintId));
  return { hints: await hintCards(db, user.userId, questionId) };
}

/** Reconcile one of the user's own pending verifications right now (safe: re-reads the chain). */
export async function recheckVerification(db: Db, user: SessionUser, verificationId: string) {
  const [v] = await db.select().from(activityVerifications).where(eq(activityVerifications.id, verificationId)).limit(1);
  if (!v || v.userId !== user.userId) throw notFound("Verification not found.");
  return engine(processVerification(db, engineDeps(), v.id));
}

// ---------------------------------------------------------------------------- manual reviews

export async function listReviews(db: Db, orgId: string) {
  const rows = await db
    .select({ v: activityVerifications, player: users.displayName, hintTitle: treasureHints.title, unlock: treasureHints.unlock, campaign: campaigns.title })
    .from(activityVerifications)
    .innerJoin(users, eq(users.id, activityVerifications.userId))
    .innerJoin(treasureHints, eq(treasureHints.id, activityVerifications.hintId))
    .innerJoin(campaigns, eq(campaigns.id, activityVerifications.campaignId))
    .where(and(eq(activityVerifications.ownerOrgId, orgId), eq(activityVerifications.activityType, "manual_review")))
    .orderBy(asc(activityVerifications.createdAt));
  return rows.map((r) => {
    const leaf = r.unlock ? leaves(r.unlock as RuleNode).find((l) => l.id === r.v.leafId) : undefined;
    return {
      id: r.v.id,
      status: r.v.status,
      player: r.player,
      campaign: r.campaign,
      hint: r.hintTitle,
      instructions: leaf?.activity.type === "manual_review" ? leaf.activity.instructions : "",
      submission: r.v.input as { text?: string; link?: string | null },
      reviewNote: r.v.reviewNote,
      createdAt: r.v.createdAt.toISOString(),
    };
  });
}

export async function decideReview(db: Db, user: SessionUser, verificationId: string, decision: "approve" | "reject", note: string) {
  return engine(reviewVerification(db, user.userId, verificationId, decision, note));
}

export async function fundingSourceOf(db: Db, c: CampaignRow): Promise<string> {
  const rules = (c.currentVersion ? await currentRules(db, c) : (c.draftRules as CampaignRules | null)) as CampaignRules | null;
  return rules?.fundingSource ?? "none";
}
