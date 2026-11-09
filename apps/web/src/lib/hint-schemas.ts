import { z } from "zod";
import type { RuleNode } from "@yielvy/core";
import { plainText, slug } from "./schemas";

const uuid = z.string().uuid();
const intStr = z.string().regex(/^\d{1,40}$/, "Whole number of the token's smallest unit");

export const activityInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("internal_campaign_completion"), campaignId: uuid }),
  z.object({ type: z.literal("internal_quiz"), campaignId: uuid, minScore: z.number().int().min(0).max(1_000_000).optional() }),
  z.object({ type: z.literal("internal_question_sequence"), campaignId: uuid, questionCount: z.number().int().min(1).max(50) }),
  z.object({ type: z.literal("internal_contest_entry"), campaignId: uuid }),
  z.object({ type: z.literal("manual_review"), instructions: plainText(1000, 10), requireLink: z.boolean().optional() }),
  z.object({ type: z.literal("near_rhea_swap"), network: z.literal("mainnet"), tokenIn: z.string().max(80).optional(), tokenOut: z.string().max(80).optional(), minAmountIn: intStr.optional() }),
  z.object({
    type: z.literal("near_rhea_lending_supply"),
    network: z.literal("mainnet"),
    tokenId: z.string().max(80),
    minAmount: intStr,
    minHoldSeconds: z.number().int().min(0).max(90 * 86_400).optional(),
  }),
]);

const leafInput = z.object({
  kind: z.literal("activity"),
  id: z.string().regex(/^[a-z0-9-]{1,32}$/),
  activity: activityInput,
  /** Ignored for own activities (set server-side); for partner leaves the offering decides. */
  ownerOrgId: uuid.optional(),
  offeringId: uuid.optional(),
});

export const ruleInput: z.ZodType<unknown> = z.lazy(() =>
  z.union([leafInput, z.object({ kind: z.literal("group"), op: z.enum(["ANY", "ALL"]), children: z.array(ruleInput).min(1).max(8) })]),
);

export const hintInput = z.object({
  questionId: uuid,
  title: plainText(80, 2),
  teaser: plainText(300).default(""),
  content: plainText(2000, 2),
  imageUploadId: uuid.nullable().optional(),
  /** null = free hint, available to every participant. */
  unlock: ruleInput.nullable(),
  availableFrom: z.string().datetime({ offset: true }).nullable().optional(),
  availableUntil: z.string().datetime({ offset: true }).nullable().optional(),
  withdrawalPolicy: z.enum(["disable", "free"]).default("disable"),
});
export type HintInput = Omit<z.infer<typeof hintInput>, "unlock"> & { unlock: RuleNode | null };

export const verifyInput = z.object({
  leafId: z.string().regex(/^[a-z0-9-]{1,32}$/),
  txHash: z.string().max(64).optional(),
  submission: z.object({ text: z.string().max(4000), link: z.string().max(500).optional() }).optional(),
});

export const offeringInput = z.object({
  title: plainText(80, 3),
  description: plainText(500).default(""),
  activity: activityInput,
});

export const partnerInviteInput = z.object({ organizationSlug: slug, message: plainText(500).default("") });

export const expeditionInput = z.object({ title: plainText(80, 3), summary: plainText(300).default("") });
