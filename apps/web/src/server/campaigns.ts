import "server-only";
import { createHash, randomBytes } from "node:crypto";
import {
  and,
  asc,
  campaigns,
  campaignVersions,
  count,
  eq,
  participantEntries,
  rewardPeriods,
  spaces,
  treasureAnswerRules,
  treasureQuestions,
  type Db,
} from "@yielvy/db";
import {
  buildChoiceRule,
  buildNumericRule,
  buildTextRule,
  campaignMachine,
  evaluateRuleChange,
  validateCriteria,
  validateRewardConfig,
  type CampaignRules,
  type CampaignState,
} from "@yielvy/core";
import { rulesInput, type QuestionInput, type RulesInput } from "@/lib/campaign-schemas";
import { slugify } from "@/lib/schemas";
import { encryptJson } from "./crypto";
import { env } from "./env";
import { audit } from "./audit";
import { badRequest, conflict, HttpError, notFound } from "./http";
import { vault } from "./near";
import type { SessionUser } from "./session";
import { hintPublishProblems } from "./hints";

export function defaultRules(template: "treasure_hunt" | "creative_contest"): RulesInput {
  const start = new Date(Date.now() + 86_400_000);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 14 * 86_400_000);
  return {
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    eligibility: { requireVerifiedPayout: true, blockedJurisdictions: [] },
    // Quests are about rewards: new drafts start with a prize budget (organizer picks budget or interest).
    fundingSource: "direct",
    reward:
      template === "creative_contest"
        ? { mode: "organizer_selected", winnersCount: 3, minPayout: "0", tieBreak: "earliest_completion" }
        : { mode: "equal", winnersCount: 1, minPayout: "0", tieBreak: "earliest_completion" },
    periods: 1,
    claimWindowDays: 30,
    judgingCriteria:
      template === "creative_contest"
        ? [
            { key: "originality", label: "Originality", weightBps: 4000 },
            { key: "usefulness", label: "Usefulness", weightBps: 4000 },
            { key: "clarity", label: "Clarity", weightBps: 2000 },
          ]
        : undefined,
  };
}

/** Status shown to the public: stored lifecycle state adjusted by the clock. */
export function effectiveStatus(c: { status: CampaignState; startsAt: Date | null; endsAt: Date | null }, now = new Date()): CampaignState {
  if (c.status === "SCHEDULED" && c.startsAt && c.startsAt <= now) return c.endsAt && c.endsAt <= now ? "ENDED" : "LIVE";
  if (c.status === "LIVE" && c.endsAt && c.endsAt <= now) return "ENDED";
  return c.status;
}

export async function createDraft(db: Db, user: SessionUser, spaceId: string, input: { template: "treasure_hunt" | "creative_contest"; title: string }) {
  const base = slugify(input.title) || "campaign";
  const suffix = randomBytes(2).toString("hex");
  const [row] = await db
    .insert(campaigns)
    .values({
      spaceId,
      template: input.template,
      title: input.title,
      slug: `${base}-${suffix}`.slice(0, 48),
      network: env().NEAR_NETWORK,
      createdBy: user.userId,
      draftRules: defaultRules(input.template),
    })
    .returning();
  await audit(db, { actorUserId: user.userId, action: "campaign.draft_created", targetType: "campaign", targetId: row!.id });
  return row!;
}

async function participantCount(db: Db, campaignId: string): Promise<number> {
  const [r] = await db.select({ n: count() }).from(participantEntries).where(eq(participantEntries.campaignId, campaignId));
  return r?.n ?? 0;
}

async function currentRules(db: Db, c: typeof campaigns.$inferSelect): Promise<CampaignRules | null> {
  if (!c.currentVersion) return null;
  const [v] = await db
    .select({ rules: campaignVersions.rules })
    .from(campaignVersions)
    .where(and(eq(campaignVersions.campaignId, c.id), eq(campaignVersions.version, c.currentVersion)))
    .limit(1);
  return (v?.rules as CampaignRules) ?? null;
}

/**
 * Drafts can be edited freely. Published campaigns can only change rules through a new
 * version that passes evaluateRuleChange (no material change once people have joined).
 */
export async function updateCampaign(
  db: Db,
  user: SessionUser,
  c: typeof campaigns.$inferSelect,
  patch: { title?: string; slug?: string; summary?: string; description?: string; coverUploadId?: string | null; rules?: Partial<RulesInput> },
  notice?: string,
) {
  const values: Partial<typeof campaigns.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.summary !== undefined) values.summary = patch.summary;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.coverUploadId !== undefined) values.coverUploadId = patch.coverUploadId;
  if (patch.slug !== undefined) {
    if (c.status !== "DRAFT") throw badRequest("The web address can't change after publishing.");
    values.slug = patch.slug;
  }
  if (patch.rules) {
    if (c.status === "DRAFT" || c.status === "PENDING_FUNDING") {
      values.draftRules = { ...defaultRules(c.template as "treasure_hunt"), ...(c.draftRules as object), ...patch.rules };
    } else {
      const prev = await currentRules(db, c);
      if (!prev) throw new HttpError(500, "Published rules missing.");
      const next = { ...prev, ...patch.rules } as CampaignRules;
      const parsed = rulesInput.safeParse(next);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid rules");
      const decision = evaluateRuleChange(prev, next, await participantCount(db, c.id), Boolean(c.endsAt && c.endsAt <= new Date()));
      if (!decision.allowed) throw conflict(decision.reason, "material_change_blocked");
      if (decision.requiresNotice && !notice?.trim()) throw badRequest("Explain the change to participants in a short notice.", "notice_required");
      const version = (c.currentVersion ?? 0) + 1;
      await db.insert(campaignVersions).values({
        campaignId: c.id,
        version,
        rules: next,
        rulesHash: rulesHash(next),
        changeNotice: notice ?? null,
        createdBy: user.userId,
      });
      values.currentVersion = version;
      values.endsAt = new Date(next.endsAt);
    }
  }
  try {
    await db.update(campaigns).set(values).where(eq(campaigns.id, c.id));
  } catch (e) {
    if (String((e as { cause?: { code?: string } }).cause?.code) === "23505") throw conflict("That web address is already used in your vault.");
    throw e;
  }
  await audit(db, { actorUserId: user.userId, action: "campaign.updated", targetType: "campaign", targetId: c.id, metadata: { fields: Object.keys(values) } });
}

export function rulesHash(r: unknown): string {
  return createHash("sha256").update(stableStringify(r)).digest("hex");
}
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

// ---------------------------------------------------------------------------- questions

export async function listQuestions(db: Db, campaignId: string) {
  return db.select().from(treasureQuestions).where(eq(treasureQuestions.campaignId, campaignId)).orderBy(asc(treasureQuestions.position));
}

function buildRule(q: QuestionInput, salt: string) {
  const pepper = env().ANSWER_PEPPER;
  if (q.type === "short_text") {
    return buildTextRule(pepper, salt, q.answers!, {
      trim: true,
      collapseWhitespace: true,
      caseInsensitive: !q.caseSensitive,
      stripPunctuation: q.stripPunctuation,
    });
  }
  if (q.type === "multiple_choice") return buildChoiceRule(pepper, salt, q.correctOptionId!);
  return buildNumericRule(q.numericValue!, q.numericTolerance);
}

function assertEditable(c: typeof campaigns.$inferSelect) {
  if (c.status !== "DRAFT" && c.status !== "PENDING_FUNDING") {
    throw conflict("Questions are locked once a campaign is published, so every participant answers the same hunt.");
  }
}

export async function addQuestion(db: Db, user: SessionUser, c: typeof campaigns.$inferSelect, q: QuestionInput) {
  assertEditable(c);
  if (c.template !== "treasure_hunt") throw badRequest("Only treasure hunts have questions.");
  const salt = randomBytes(16).toString("hex");
  const rule = buildRule(q, salt);
  return db.transaction(async (tx) => {
    const existing = await tx.select({ position: treasureQuestions.position }).from(treasureQuestions).where(eq(treasureQuestions.campaignId, c.id));
    if (existing.length >= 50) throw badRequest("A hunt can have at most 50 questions.");
    const position = existing.length ? Math.max(...existing.map((e) => e.position)) + 1 : 0;
    const [row] = await tx
      .insert(treasureQuestions)
      .values({
        campaignId: c.id,
        position,
        type: q.type,
        prompt: q.prompt,
        clue: q.clue ?? null,
        options: q.type === "multiple_choice" ? q.options! : null,
        imageUploadId: q.imageUploadId ?? null,
        referenceUrl: q.referenceUrl ?? null,
        difficulty: q.difficulty,
        maxAttempts: q.maxAttempts,
        cooldownSeconds: q.cooldownSeconds,
      })
      .returning();
    await tx.insert(treasureAnswerRules).values({ questionId: row!.id, salt, ciphertext: encryptJson(rule) });
    await audit(tx, { actorUserId: user.userId, action: "question.added", targetType: "campaign", targetId: c.id, metadata: { questionId: row!.id } });
    return row!;
  });
}

export async function updateQuestion(db: Db, user: SessionUser, c: typeof campaigns.$inferSelect, questionId: string, q: QuestionInput) {
  assertEditable(c);
  const salt = randomBytes(16).toString("hex");
  const rule = buildRule(q, salt);
  await db.transaction(async (tx) => {
    const res = await tx
      .update(treasureQuestions)
      .set({
        type: q.type,
        prompt: q.prompt,
        clue: q.clue ?? null,
        options: q.type === "multiple_choice" ? q.options! : null,
        imageUploadId: q.imageUploadId ?? null,
        referenceUrl: q.referenceUrl ?? null,
        difficulty: q.difficulty,
        maxAttempts: q.maxAttempts,
        cooldownSeconds: q.cooldownSeconds,
      })
      .where(and(eq(treasureQuestions.id, questionId), eq(treasureQuestions.campaignId, c.id)))
      .returning({ id: treasureQuestions.id });
    if (!res.length) throw notFound("Question not found.");
    await tx.update(treasureAnswerRules).set({ salt, ciphertext: encryptJson(rule) }).where(eq(treasureAnswerRules.questionId, questionId));
    await audit(tx, { actorUserId: user.userId, action: "question.updated", targetType: "campaign", targetId: c.id, metadata: { questionId } });
  });
}

export async function deleteQuestion(db: Db, user: SessionUser, c: typeof campaigns.$inferSelect, questionId: string) {
  assertEditable(c);
  await db.transaction(async (tx) => {
    const res = await tx.delete(treasureQuestions).where(and(eq(treasureQuestions.id, questionId), eq(treasureQuestions.campaignId, c.id))).returning();
    if (!res.length) throw notFound("Question not found.");
    await renumber(tx as unknown as Db, c.id, (await listQuestions(tx as unknown as Db, c.id)).map((q) => q.id));
    await audit(tx, { actorUserId: user.userId, action: "question.deleted", targetType: "campaign", targetId: c.id, metadata: { questionId } });
  });
}

/** Reorders by moving everything to negative positions first so the unique index never collides. */
async function renumber(db: Db, campaignId: string, orderedIds: string[]) {
  for (const [i, id] of orderedIds.entries()) {
    await db.update(treasureQuestions).set({ position: -1 - i }).where(and(eq(treasureQuestions.id, id), eq(treasureQuestions.campaignId, campaignId)));
  }
  for (const [i, id] of orderedIds.entries()) {
    await db.update(treasureQuestions).set({ position: i }).where(and(eq(treasureQuestions.id, id), eq(treasureQuestions.campaignId, campaignId)));
  }
}

export async function reorderQuestions(db: Db, user: SessionUser, c: typeof campaigns.$inferSelect, orderedIds: string[]) {
  assertEditable(c);
  const current = await listQuestions(db, c.id);
  if (current.length !== orderedIds.length || !current.every((q) => orderedIds.includes(q.id))) throw badRequest("The new order must include every question exactly once.");
  await db.transaction(async (tx) => renumber(tx as unknown as Db, c.id, orderedIds));
  await audit(db, { actorUserId: user.userId, action: "question.reordered", targetType: "campaign", targetId: c.id });
}

// ---------------------------------------------------------------------------- publish

export interface PublishCheck {
  ok: boolean;
  problems: string[];
  warnings: string[];
  funding: { required: boolean; verified: boolean; detail: string };
}

export async function checkPublishable(db: Db, c: typeof campaigns.$inferSelect): Promise<PublishCheck> {
  const problems: string[] = [];
  const parsed = rulesInput.safeParse({ ...defaultRules(c.template as "treasure_hunt"), ...(c.draftRules as object) });
  let rules: RulesInput | null = null;
  if (!parsed.success) problems.push(...parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  else rules = parsed.data;
  if (!c.summary.trim()) problems.push("Add a one-line hook in the Story step.");
  if (c.template === "creative_contest" && c.description.trim().length < 20) problems.push("Say what you are looking for in the Story step.");
  if (rules) {
    const start = Date.parse(rules.startsAt), end = Date.parse(rules.endsAt);
    if (end <= start) problems.push("The end date must be after the start date.");
    if (end <= Date.now()) problems.push("The end date is in the past.");
    if (end - start < 3_600_000) problems.push("Campaigns must run for at least an hour.");
    if (rules.fundingSource !== "none") {
      const rc = { ...rules.reward, perPersonCap: rules.reward.perPersonCap ? BigInt(rules.reward.perPersonCap) : undefined, minPayout: BigInt(rules.reward.minPayout) };
      problems.push(...validateRewardConfig(rc));
      if (rules.reward.mode === "random_draw" && !env().RANDOM_DRAW_ALLOWED_COUNTRIES.trim()) {
        problems.push("Random draws are disabled until a jurisdiction has been cleared for prize promotions.");
      }
      if (rules.reward.mode === "organizer_selected" && c.template === "treasure_hunt") problems.push("Treasure hunts use objective reward modes.");
    }
    if (c.template === "creative_contest") problems.push(...validateCriteria(rules.judgingCriteria ?? []));
  }
  const warnings: string[] = [];
  if (c.template === "treasure_hunt") {
    const qs = await listQuestions(db, c.id);
    if (qs.length === 0) problems.push("Add at least one question.");
    const hp = await hintPublishProblems(db, c, rules?.fundingSource ?? "none");
    problems.push(...hp.problems);
    warnings.push(...hp.warnings);
  }
  const [space] = await db.select({ moderation: spaces.moderation }).from(spaces).where(eq(spaces.id, c.spaceId)).limit(1);
  if (space?.moderation !== "approved") problems.push("Your Space must be approved before campaigns can go public.");

  // Funding: verified against the vault contract, never against a form field.
  let funding = { required: false, verified: true, detail: "No token rewards. The campaign page will say so clearly." };
  if (rules && rules.fundingSource !== "none") {
    funding = { required: true, verified: false, detail: "" };
    const v = vault();
    if (!v) funding.detail = "The vault contract isn't deployed on this network yet, so rewards can't be funded.";
    else if (c.vaultCampaignId === null) funding.detail = "Register this campaign in the vault and deposit funds first.";
    else {
      const onchain = await v.campaign(c.vaultCampaignId);
      if (!onchain) funding.detail = "The vault has no record of this campaign.";
      else {
        const hasPrincipal = BigInt(onchain.principal_supplied) + BigInt(onchain.principal_idle) > 0n;
        const hasBonus = BigInt(onchain.bonus_available) + BigInt(onchain.reserved) > 0n;
        const needPrincipal = rules.fundingSource === "yield" || rules.fundingSource === "both";
        const needBonus = rules.fundingSource === "direct" || rules.fundingSource === "both";
        const planned = rules.plannedDirectBudget ? BigInt(rules.plannedDirectBudget) : 0n;
        if (needPrincipal && !hasPrincipal) funding.detail = "No principal has been deposited yet.";
        else if (needBonus && !hasBonus) funding.detail = "No direct reward budget has been deposited yet.";
        else if (planned > 0n && BigInt(onchain.bonus_available) + BigInt(onchain.reserved) < planned) funding.detail = "The deposited reward budget is below the amount you planned.";
        else funding = { required: true, verified: true, detail: "Funding confirmed on-chain." };
      }
    }
    if (!funding.verified) problems.push(funding.detail);
  }
  return { ok: problems.length === 0, problems, warnings, funding };
}

export async function publishCampaign(db: Db, user: SessionUser, c: typeof campaigns.$inferSelect) {
  if (c.status !== "DRAFT" && c.status !== "PENDING_FUNDING") throw conflict("This campaign is already published.");
  const check = await checkPublishable(db, c);
  if (!check.ok) throw new HttpError(422, check.problems[0] ?? "Not ready to publish", "not_publishable");
  const rules = rulesInput.parse({ ...defaultRules(c.template as "treasure_hunt"), ...(c.draftRules as object) });
  const fullRules: CampaignRules = {
    template: c.template as "treasure_hunt" | "creative_contest",
    ...rules,
    questionCount: c.template === "treasure_hunt" ? (await listQuestions(db, c.id)).length : undefined,
  } as CampaignRules;
  const startsAt = new Date(rules.startsAt), endsAt = new Date(rules.endsAt);
  const next: CampaignState = startsAt <= new Date() ? "LIVE" : "SCHEDULED";
  campaignMachine.assert(c.status as CampaignState, next);
  await db.transaction(async (tx) => {
    await tx.insert(campaignVersions).values({ campaignId: c.id, version: 1, rules: fullRules, rulesHash: rulesHash(fullRules), createdBy: user.userId });
    await tx.update(campaigns).set({ status: next, currentVersion: 1, startsAt, endsAt, publishedAt: new Date(), updatedAt: new Date() }).where(eq(campaigns.id, c.id));
    if (rules.fundingSource !== "none") {
      const span = (endsAt.getTime() - startsAt.getTime()) / rules.periods;
      for (let i = 0; i < rules.periods; i++) {
        await tx.insert(rewardPeriods).values({
          campaignId: c.id,
          periodNumber: i + 1,
          startsAt: new Date(startsAt.getTime() + span * i),
          endsAt: new Date(startsAt.getTime() + span * (i + 1)),
        });
      }
    }
    await audit(tx, { actorUserId: user.userId, action: "campaign.published", targetType: "campaign", targetId: c.id, metadata: { status: next, rulesHash: rulesHash(fullRules) } });
  });
  return { status: next };
}

export async function setCampaignState(db: Db, user: SessionUser, c: typeof campaigns.$inferSelect, to: "PAUSED" | "LIVE" | "ENDED") {
  const from = effectiveStatus(c as never) as CampaignState;
  campaignMachine.assert(from, to);
  const values: Partial<typeof campaigns.$inferInsert> = { status: to, updatedAt: new Date() };
  if (to === "ENDED" && c.endsAt && c.endsAt > new Date()) values.endsAt = new Date();
  await db.update(campaigns).set(values).where(eq(campaigns.id, c.id));
  await audit(db, { actorUserId: user.userId, action: `campaign.${to.toLowerCase()}`, targetType: "campaign", targetId: c.id, metadata: { from } });
}

export { currentRules };
