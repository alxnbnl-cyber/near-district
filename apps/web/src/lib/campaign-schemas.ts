import { z } from "zod";
import { httpUrl, plainText, slug } from "./schemas";

export const TEMPLATES = {
  treasure_hunt: { label: "Mission", live: true, blurb: "A trail of questions and clues. Answer them all to qualify." },
  creative_contest: { label: "Creative Contest", live: true, blurb: "Ask for ideas, feedback or creative work. Your team picks winners." },
  product_explorer: { label: "Product Explorer", live: false, blurb: "Guided tours through your product. Coming soon." },
  more_experiences: { label: "More experiences", live: false, blurb: "More formats are on the way." },
} as const;

const intStr = z.string().regex(/^\d+$/, "Whole token units only");

export const rewardConfigInput = z.object({
  mode: z.enum(["equal", "top_scorers", "organizer_selected", "random_draw"]),
  winnersCount: z.number().int().min(1).max(10_000),
  rankSharesBps: z.array(z.number().int().min(0).max(10_000)).max(50).optional(),
  perPersonCap: intStr.optional(),
  minPayout: intStr.default("0"),
  tieBreak: z.enum(["earliest_completion", "split"]).default("earliest_completion"),
  maxQualified: z.number().int().min(1).max(1_000_000).optional(),
});

export const criterionInput = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,23}$/),
  label: plainText(40, 2),
  weightBps: z.number().int().min(1).max(10_000),
});

export const rulesInput = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  eligibility: z.object({
    requireVerifiedPayout: z.boolean().default(true),
    maxParticipants: z.number().int().min(1).max(1_000_000).optional(),
    blockedJurisdictions: z.array(z.string().length(2).toUpperCase()).max(250).default([]),
  }),
  fundingSource: z.enum(["none", "yield", "direct", "both"]),
  reward: rewardConfigInput,
  periods: z.number().int().min(1).max(365).default(1),
  judgingCriteria: z.array(criterionInput).max(8).optional(),
  claimWindowDays: z.number().int().min(7).max(365).default(30),
  plannedDirectBudget: intStr.optional(),
});
export type RulesInput = z.infer<typeof rulesInput>;

export const createCampaignInput = z.object({
  template: z.enum(["treasure_hunt", "creative_contest"]),
  title: plainText(80, 3),
});

export const campaignDetailsInput = z.object({
  title: plainText(80, 3).optional(),
  slug: slug.optional(),
  summary: plainText(200).optional(),
  description: plainText(6000).optional(),
  coverUploadId: z.string().uuid().nullable().optional(),
  rules: rulesInput.partial().optional(),
});

export const questionInput = z
  .object({
    type: z.enum(["short_text", "multiple_choice", "numeric"]),
    prompt: plainText(1000, 3),
    clue: plainText(500).optional(),
    /** Answer & explanation shown to players only after the deadline. */
    revealText: plainText(2000).optional(),
    referenceUrl: httpUrl.optional().or(z.literal("").transform(() => undefined)),
    imageUploadId: z.string().uuid().nullable().optional(),
    difficulty: z.number().int().min(1).max(5).default(1),
    maxAttempts: z.number().int().min(1).max(100).default(10),
    cooldownSeconds: z.number().int().min(0).max(86_400).default(0),
    // answer definition (write-only; never returned to clients)
    answers: z.array(plainText(200, 1)).max(20).optional(),
    caseSensitive: z.boolean().default(false),
    stripPunctuation: z.boolean().default(false),
    options: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]{1,24}$/), label: plainText(200, 1) })).max(8).optional(),
    correctOptionId: z.string().optional(),
    numericValue: z.string().optional(),
    numericTolerance: z.string().default("0"),
  })
  .superRefine((q, ctx) => {
    if (q.type === "short_text" && (!q.answers || q.answers.length === 0)) ctx.addIssue({ code: "custom", message: "Add at least one accepted answer", path: ["answers"] });
    if (q.type === "multiple_choice") {
      if (!q.options || q.options.length < 2) ctx.addIssue({ code: "custom", message: "Add at least two options", path: ["options"] });
      else if (!q.options.some((o) => o.id === q.correctOptionId)) ctx.addIssue({ code: "custom", message: "Pick the correct option", path: ["correctOptionId"] });
      else if (new Set(q.options.map((o) => o.id)).size !== q.options.length) ctx.addIssue({ code: "custom", message: "Options must be unique", path: ["options"] });
    }
    if (q.type === "numeric" && !/^[+-]?\d+(\.\d+)?$/.test(q.numericValue ?? "")) ctx.addIssue({ code: "custom", message: "Enter the numeric answer", path: ["numericValue"] });
  });
export type QuestionInput = z.infer<typeof questionInput>;

export const submissionInput = z.object({
  title: plainText(120, 3),
  body: plainText(8000, 20),
  externalUrl: httpUrl.optional().or(z.literal("").transform(() => undefined)),
  imageUploadId: z.string().uuid().nullable().optional(),
});

export const reviewInput = z.object({
  scores: z.record(z.string(), z.number().int().min(0).max(10)),
  privateNote: plainText(2000).optional(),
  decision: z.enum(["shortlist", "reject", "none"]).default("none"),
});
