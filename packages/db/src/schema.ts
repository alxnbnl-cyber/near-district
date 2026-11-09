/**
 * Yielvy relational schema.
 *
 * The database is an operational index. It is NOT the authority for on-chain asset
 * ownership: vault balances live in the vault contract, and every financial row here is
 * either (a) derived from verified chain events, or (b) an operational request whose
 * outcome is confirmed against chain state before it is marked complete.
 *
 * Money is stored as numeric(78,0) in the token's smallest unit and surfaced as bigint.
 * ledger_entries and audit_logs are append-only (enforced by triggers in migrations).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  bigint as pgBigint,
} from "drizzle-orm/pg-core";

/** Exact token amount: numeric(78,0) <-> bigint. */
export const amount = customType<{ data: bigint; driverData: string }>({
  dataType: () => "numeric(78, 0)",
  toDriver: (v) => v.toString(),
  fromDriver: (v) => BigInt(v),
});

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ------------------------------------------------------------------ enums

export const userStatus = pgEnum("user_status", ["active", "suspended"]);
export const identityProvider = pgEnum("identity_provider", ["email", "near"]);
export const adminRole = pgEnum("admin_role", ["superadmin", "finance", "moderator", "support"]);
export const orgRole = pgEnum("org_role", ["owner", "admin", "editor", "reviewer"]);
export const moderationStatus = pgEnum("moderation_status", ["pending", "approved", "rejected", "suspended"]);
export const campaignTemplate = pgEnum("campaign_template", ["treasure_hunt", "creative_contest", "product_explorer", "more_experiences"]);
export const campaignStatus = pgEnum("campaign_status", [
  "DRAFT",
  "PENDING_FUNDING",
  "SCHEDULED",
  "LIVE",
  "PAUSED",
  "ENDED",
  "AWAITING_RESULTS",
  "COMPLETED",
  "SUSPENDED",
]);
export const questionType = pgEnum("question_type", ["short_text", "multiple_choice", "numeric"]);
export const entryStatus = pgEnum("entry_status", ["in_progress", "completed", "disqualified"]);
export const qualificationStatus = pgEnum("qualification_status", ["qualified", "held", "revoked"]);
export const submissionStatus = pgEnum("submission_status", ["submitted", "shortlisted", "rejected", "winner", "withdrawn"]);
export const fundingKind = pgEnum("funding_kind", ["principal", "bonus"]);
export const fundingRoute = pgEnum("funding_route", ["native", "intents"]);
export const fundingState = pgEnum("funding_state", [
  "CREATED",
  "QUOTED",
  "AWAITING_PAYMENT",
  "DETECTED",
  "SETTLING",
  "RECEIVED",
  "SUPPLY_PENDING",
  "SUPPLIED",
  "EXPIRED",
  "INCOMPLETE",
  "REFUNDED",
  "FAILED",
  "REQUIRES_REVIEW",
]);
export const rewardPeriodState = pgEnum("reward_period_state", [
  "SCHEDULED",
  "ELIGIBILITY_FROZEN",
  "YIELD_SETTLEMENT_PENDING",
  "FUNDS_RESERVED",
  "WINNERS_FINALIZED",
  "CLAIMABLE",
  "COMPLETED",
  "VETOED",
  "NO_WINNERS",
  "REQUIRES_REVIEW",
]);
export const withdrawalState = pgEnum("withdrawal_state", [
  "REQUESTED",
  "VALIDATING",
  "REDEMPTION_PENDING",
  "REDEEMED",
  "TRANSFER_PENDING",
  "CONFIRMED",
  "LIQUIDITY_WAIT",
  "REJECTED",
  "FAILED",
  "REQUIRES_REVIEW",
]);
export const claimState = pgEnum("claim_state", ["AVAILABLE", "SUBMITTED", "CONFIRMED", "FAILED", "EXPIRED"]);
export const chainOpStatus = pgEnum("chain_op_status", ["queued", "submitted", "succeeded", "failed", "requires_review"]);
export const ledgerBucket = pgEnum("ledger_bucket", [
  "principal_idle",
  "principal_supplied",
  "yield_available",
  "bonus_available",
  "reserved",
  "claimed",
  "fees",
  "withdrawn",
]);
export const jobStatus = pgEnum("job_status", ["pending", "running", "done", "dead"]);
export const reportStatus = pgEnum("report_status", ["open", "actioned", "dismissed"]);
export const adjustmentStatus = pgEnum("adjustment_status", ["proposed", "approved", "rejected", "applied"]);

// ------------------------------------------------------------------ identity & auth

export const users = pgTable("users", {
  id: id(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  status: userStatus("status").notNull().default("active"),
  suspendedReason: text("suspended_reason"),
  countryCode: text("country_code"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)]);

export const userIdentities = pgTable("user_identities", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: identityProvider("provider").notNull(),
  subject: text("subject").notNull(),
  verifiedAt: ts("verified_at").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("user_identities_provider_subject_uq").on(t.provider, t.subject), index("user_identities_user_idx").on(t.userId)]);

/** NEAR accounts whose ownership was proven with a signed NEP-413 challenge. */
export const walletConnections = pgTable("wallet_connections", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  network: text("network").notNull(),
  accountId: text("account_id").notNull(),
  publicKey: text("public_key").notNull(),
  isPayout: boolean("is_payout").notNull().default(false),
  verifiedAt: ts("verified_at").notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("wallet_connections_network_account_uq").on(t.network, t.accountId),
  uniqueIndex("wallet_connections_one_payout_uq").on(t.userId, t.network).where(sql`${t.isPayout}`),
]);

export const authChallenges = pgTable("auth_challenges", {
  id: id(),
  nonce: text("nonce").notNull(),
  purpose: text("purpose").notNull(), // near_login | link_wallet
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  recipient: text("recipient").notNull(),
  message: text("message").notNull(),
  expiresAt: ts("expires_at").notNull(),
  consumedAt: ts("consumed_at"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("auth_challenges_nonce_uq").on(t.nonce)]);

export const emailLoginTokens = pgTable("email_login_tokens", {
  id: id(),
  tokenHash: text("token_hash").notNull(),
  email: text("email").notNull(),
  expiresAt: ts("expires_at").notNull(),
  consumedAt: ts("consumed_at"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("email_login_tokens_hash_uq").on(t.tokenHash), index("email_login_tokens_email_idx").on(t.email)]);

export const sessions = pgTable("sessions", {
  id: id(),
  tokenHash: text("token_hash").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** When the session last proved wallet ownership (step-up for organizer finance actions). */
  walletVerifiedAt: ts("wallet_verified_at"),
  userAgent: text("user_agent"),
  ipHash: text("ip_hash"),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
  lastSeenAt: ts("last_seen_at"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("sessions_token_hash_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)]);

export const adminRoles = pgTable("admin_roles", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: adminRole("role").notNull(),
  grantedBy: uuid("granted_by").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.role] })]);

// ------------------------------------------------------------------ organizations & spaces

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  status: moderationStatus("status").notNull().default("pending"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("organizations_slug_uq").on(t.slug)]);

export const organizationMembers = pgTable("organization_members", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: orgRole("role").notNull(),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.organizationId, t.userId] })]);

export const uploads = pgTable("uploads", {
  id: id(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
  organizationId: uuid("organization_id").references(() => organizations.id),
  purpose: text("purpose").notNull(), // logo | banner | cover | question_image | submission_image
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  width: integer("width"),
  height: integer("height"),
  sha256: text("sha256").notNull(),
  moderation: moderationStatus("moderation").notNull().default("pending"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("uploads_storage_key_uq").on(t.storageKey)]);

/** ONE organization = ONE space. */
export const spaces = pgTable("spaces", {
  id: id(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  tagline: text("tagline").notNull().default(""),
  description: text("description").notNull().default(""),
  category: text("category").notNull(),
  websiteUrl: text("website_url"),
  socials: jsonb("socials").$type<Record<string, string>>().notNull().default({}),
  logoUploadId: uuid("logo_upload_id").references(() => uploads.id),
  bannerUploadId: uuid("banner_upload_id").references(() => uploads.id),
  buildingStyle: text("building_style").notNull().default("workshop"),
  accentColor: text("accent_color"),
  moderation: moderationStatus("moderation").notNull().default("pending"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("spaces_org_uq").on(t.organizationId), uniqueIndex("spaces_slug_uq").on(t.slug)]);

export const worldDistricts = pgTable("world_districts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  sortOrder: smallint("sort_order").notNull(),
});

/** Persisted deterministic plot assignment: a plot is never reused or moved. */
export const worldBuildings = pgTable("world_buildings", {
  spaceId: uuid("space_id").primaryKey().references(() => spaces.id, { onDelete: "cascade" }),
  districtId: text("district_id").notNull().references(() => worldDistricts.id),
  plotIndex: integer("plot_index").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("world_buildings_plot_uq").on(t.districtId, t.plotIndex)]);

// ------------------------------------------------------------------ campaigns

export const campaigns = pgTable("campaigns", {
  id: id(),
  spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  template: campaignTemplate("template").notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  summary: text("summary").notNull().default(""),
  description: text("description").notNull().default(""),
  coverUploadId: uuid("cover_upload_id").references(() => uploads.id),
  status: campaignStatus("status").notNull().default("DRAFT"),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  currentVersion: integer("current_version"),
  /** Working copy of the rules while DRAFT; published rules live in campaign_versions. */
  draftRules: jsonb("draft_rules").notNull().default({}),
  /** Optional ISO country allowlist for participation (null = platform defaults). */
  allowedCountries: jsonb("allowed_countries").$type<string[] | null>(),
  network: text("network").notNull(),
  /** Campaign id inside the vault contract once registered on-chain. */
  vaultCampaignId: pgBigint("vault_campaign_id", { mode: "bigint" }),
  featured: boolean("featured").notNull().default(false),
  moderation: moderationStatus("moderation").notNull().default("approved"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  publishedAt: ts("published_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("campaigns_space_slug_uq").on(t.spaceId, t.slug),
  uniqueIndex("campaigns_vault_id_uq").on(t.network, t.vaultCampaignId),
  index("campaigns_status_idx").on(t.status),
]);

/** Immutable published rule versions. */
export const campaignVersions = pgTable("campaign_versions", {
  id: id(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  rules: jsonb("rules").notNull(),
  rulesHash: text("rules_hash").notNull(),
  changeNotice: text("change_notice"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("campaign_versions_uq").on(t.campaignId, t.version)]);

export const treasureQuestions = pgTable("treasure_questions", {
  id: id(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  type: questionType("type").notNull(),
  prompt: text("prompt").notNull(),
  clue: text("clue"),
  /** For multiple choice: [{id,label}] — labels only, never which is correct. */
  options: jsonb("options").$type<{ id: string; label: string }[]>(),
  imageUploadId: uuid("image_upload_id").references(() => uploads.id),
  referenceUrl: text("reference_url"),
  difficulty: smallint("difficulty").notNull().default(1),
  maxAttempts: integer("max_attempts").notNull().default(10),
  cooldownSeconds: integer("cooldown_seconds").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("treasure_questions_pos_uq").on(t.campaignId, t.position)]);

/** Server-only. AES-256-GCM encrypted AnswerRule (HMAC digests / numeric target). */
export const treasureAnswerRules = pgTable("treasure_answer_rules", {
  questionId: uuid("question_id").primaryKey().references(() => treasureQuestions.id, { onDelete: "cascade" }),
  salt: text("salt").notNull(),
  ciphertext: text("ciphertext").notNull(),
  keyVersion: smallint("key_version").notNull().default(1),
});

export const participantEntries = pgTable("participant_entries", {
  id: id(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  status: entryStatus("status").notNull().default("in_progress"),
  /** Index of the next unanswered question (0-based). Server-authoritative. */
  progress: integer("progress").notNull().default(0),
  score: integer("score").notNull().default(0),
  rulesVersion: integer("rules_version").notNull(),
  startedAt: createdAt(),
  completedAt: ts("completed_at"),
}, (t) => [uniqueIndex("participant_entries_uq").on(t.campaignId, t.userId), index("participant_entries_campaign_idx").on(t.campaignId, t.status)]);

export const questionAttempts = pgTable("question_attempts", {
  id: id(),
  entryId: uuid("entry_id").notNull().references(() => participantEntries.id, { onDelete: "cascade" }),
  questionId: uuid("question_id").notNull().references(() => treasureQuestions.id, { onDelete: "cascade" }),
  correct: boolean("correct").notNull(),
  /** HMAC of the normalized submission — used for shared-answer/duplicate detection, never reversible. */
  submissionDigest: text("submission_digest").notNull(),
  ipHash: text("ip_hash"),
  createdAt: createdAt(),
}, (t) => [index("question_attempts_entry_q_idx").on(t.entryId, t.questionId, t.createdAt)]);

export const qualifications = pgTable("qualifications", {
  id: id(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  score: integer("score").notNull().default(0),
  status: qualificationStatus("status").notNull().default("qualified"),
  holdReason: text("hold_reason"),
  qualifiedAt: ts("qualified_at").notNull(),
}, (t) => [uniqueIndex("qualifications_uq").on(t.campaignId, t.userId)]);

export const creativeSubmissions = pgTable("creative_submissions", {
  id: id(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  externalUrl: text("external_url"),
  imageUploadId: uuid("image_upload_id").references(() => uploads.id),
  status: submissionStatus("status").notNull().default("submitted"),
  moderation: moderationStatus("moderation").notNull().default("approved"),
  rulesVersion: integer("rules_version").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("creative_submissions_uq").on(t.campaignId, t.userId), index("creative_submissions_status_idx").on(t.campaignId, t.status)]);

/** Append-only review history; the latest row per (submission, reviewer) is current. */
export const submissionReviews = pgTable("submission_reviews", {
  id: id(),
  submissionId: uuid("submission_id").notNull().references(() => creativeSubmissions.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").notNull().references(() => users.id),
  scores: jsonb("scores").$type<Record<string, number>>().notNull(),
  weightedScore: integer("weighted_score").notNull(),
  privateNote: text("private_note"),
  decision: text("decision"), // shortlist | reject | winner | null
  createdAt: createdAt(),
}, (t) => [index("submission_reviews_sub_idx").on(t.submissionId, t.createdAt)]);

// ------------------------------------------------------------------ rewards

export const rewardPeriods = pgTable("reward_periods", {
  id: id(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  periodNumber: integer("period_number").notNull(),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
  state: rewardPeriodState("state").notNull().default("SCHEDULED"),
  seed: text("seed"),
  allocationRoot: text("allocation_root"),
  allocatedTotal: amount("allocated_total"),
  reservedYield: amount("reserved_yield").notNull().default(sql`0`),
  reservedBonus: amount("reserved_bonus").notNull().default(sql`0`),
  claimableAfter: ts("claimable_after"),
  claimDeadline: ts("claim_deadline"),
  blockedReason: text("blocked_reason"),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("reward_periods_uq").on(t.campaignId, t.periodNumber), index("reward_periods_state_idx").on(t.state)]);

/** Frozen, immutable eligibility set with the commitment published on-chain. */
export const eligibilitySnapshots = pgTable("eligibility_snapshots", {
  id: id(),
  rewardPeriodId: uuid("reward_period_id").notNull().references(() => rewardPeriods.id),
  commitment: text("commitment").notNull(),
  participantCount: integer("participant_count").notNull(),
  participants: jsonb("participants").$type<{ userId: string; accountId: string; score: number; completedAt: string }[]>().notNull(),
  commitTxHash: text("commit_tx_hash"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("eligibility_snapshots_period_uq").on(t.rewardPeriodId)]);

export const rewardAllocations = pgTable("reward_allocations", {
  id: id(),
  rewardPeriodId: uuid("reward_period_id").notNull().references(() => rewardPeriods.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  accountId: text("account_id").notNull(),
  amount: amount("amount").notNull(),
  rank: integer("rank"),
  proof: jsonb("proof").$type<string[]>().notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("reward_allocations_uq").on(t.rewardPeriodId, t.accountId)]);

export const rewardClaims = pgTable("reward_claims", {
  id: id(),
  allocationId: uuid("allocation_id").notNull().references(() => rewardAllocations.id),
  state: claimState("state").notNull().default("AVAILABLE"),
  txHash: text("tx_hash"),
  failureReason: text("failure_reason"),
  submittedAt: ts("submitted_at"),
  confirmedAt: ts("confirmed_at"),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("reward_claims_allocation_uq").on(t.allocationId)]);

export const rewardReserves = pgTable("reward_reserves", {
  id: id(),
  rewardPeriodId: uuid("reward_period_id").notNull().references(() => rewardPeriods.id),
  fromYield: amount("from_yield").notNull(),
  fromBonus: amount("from_bonus").notNull(),
  txHash: text("tx_hash").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("reward_reserves_tx_uq").on(t.txHash)]);

// ------------------------------------------------------------------ funding & vault

export const vaults = pgTable("vaults", {
  id: id(),
  network: text("network").notNull(),
  contractId: text("contract_id").notNull(),
  tokenId: text("token_id").notNull(),
  lendingId: text("lending_id").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("vaults_uq").on(t.network, t.contractId)]);

export const fundingOrders = pgTable("funding_orders", {
  id: id(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  organizerUserId: uuid("organizer_user_id").notNull().references(() => users.id),
  kind: fundingKind("kind").notNull(),
  route: fundingRoute("route").notNull(),
  state: fundingState("state").notNull().default("CREATED"),
  tokenId: text("token_id").notNull(),
  /** Amount the organizer intends to deposit into the vault (token units). */
  amount: amount("amount").notNull(),
  /** Amount verified on-chain from the vault's NEP-297 event. */
  receivedAmount: amount("received_amount"),
  sponsorAccountId: text("sponsor_account_id").notNull(),
  intentsQuote: jsonb("intents_quote"),
  intentsDepositAddress: text("intents_deposit_address"),
  intentsOriginAsset: text("intents_origin_asset"),
  intentsStatus: text("intents_status"),
  originTxHash: text("origin_tx_hash"),
  nearTxHash: text("near_tx_hash"),
  expiresAt: ts("expires_at"),
  failureReason: text("failure_reason"),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("funding_orders_idem_uq").on(t.idempotencyKey),
  uniqueIndex("funding_orders_near_tx_uq").on(t.nearTxHash),
  uniqueIndex("funding_orders_deposit_addr_uq").on(t.intentsDepositAddress),
  index("funding_orders_state_idx").on(t.state),
]);

/** Every chain transaction we observe or submit, verified via RPC (never trusted from the client). */
export const chainTransactions = pgTable("chain_transactions", {
  id: id(),
  network: text("network").notNull(),
  txHash: text("tx_hash").notNull(),
  signerId: text("signer_id").notNull(),
  receiverId: text("receiver_id").notNull(),
  status: text("status").notNull(), // success | failure | pending
  blockHeight: pgBigint("block_height", { mode: "bigint" }),
  events: jsonb("events").$type<unknown[]>().notNull().default([]),
  verifiedAt: ts("verified_at"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("chain_transactions_uq").on(t.network, t.txHash)]);

/** Append-only snapshots of on-chain campaign state (from vault.get_campaign). */
export const vaultPositions = pgTable("vault_positions", {
  id: id(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  blockHeight: pgBigint("block_height", { mode: "bigint" }).notNull(),
  principalIdle: amount("principal_idle").notNull(),
  principalSupplied: amount("principal_supplied").notNull(),
  rheaShares: amount("rhea_shares").notNull(),
  positionValue: amount("position_value").notNull(),
  yieldAvailable: amount("yield_available").notNull(),
  bonusAvailable: amount("bonus_available").notNull(),
  reserved: amount("reserved").notNull(),
  claimedTotal: amount("claimed_total").notNull(),
  observedSupplyApr: text("observed_supply_apr"),
  observedAt: createdAt(),
}, (t) => [index("vault_positions_campaign_idx").on(t.campaignId, t.observedAt)]);

/**
 * Append-only financial event log derived from vault NEP-297 events. One row per bucket
 * movement; `event_ref` (tx:receipt:log:bucket) makes indexing idempotent.
 */
export const ledgerEntries = pgTable("ledger_entries", {
  id: id(),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  bucket: ledgerBucket("bucket").notNull(),
  delta: amount("delta").notNull(), // numeric allows negatives
  eventType: text("event_type").notNull(),
  eventRef: text("event_ref").notNull(),
  txHash: text("tx_hash").notNull(),
  blockHeight: pgBigint("block_height", { mode: "bigint" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("ledger_entries_ref_uq").on(t.eventRef), index("ledger_entries_campaign_idx").on(t.campaignId, t.bucket)]);

export const yieldSettlements = pgTable("yield_settlements", {
  id: id(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  vaultOpId: pgBigint("vault_op_id", { mode: "bigint" }),
  state: text("state").notNull(), // pending | requested | settled | not_executed | aborted | requires_review
  requested: amount("requested"),
  received: amount("received"),
  fee: amount("fee"),
  abortReason: text("abort_reason"),
  txHashes: jsonb("tx_hashes").$type<string[]>().notNull().default([]),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: ts("next_attempt_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const withdrawalRequests = pgTable("withdrawal_requests", {
  id: id(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  state: withdrawalState("state").notNull().default("REQUESTED"),
  principalAmount: amount("principal_amount").notNull(),
  yieldAmount: amount("yield_amount").notNull(),
  bonusAmount: amount("bonus_amount").notNull(),
  destinationAccountId: text("destination_account_id").notNull(),
  txHashes: jsonb("tx_hashes").$type<string[]>().notNull().default([]),
  failureReason: text("failure_reason"),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("withdrawal_requests_idem_uq").on(t.idempotencyKey)]);

/** Operator-signed transactions. One row per intended action; idempotency key prevents duplicates. */
export const blockchainOperations = pgTable("blockchain_operations", {
  id: id(),
  kind: text("kind").notNull(),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  status: chainOpStatus("status").notNull().default("queued"),
  idempotencyKey: text("idempotency_key").notNull(),
  args: jsonb("args").notNull(),
  txHash: text("tx_hash"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("blockchain_operations_idem_uq").on(t.idempotencyKey), index("blockchain_operations_status_idx").on(t.status)]);

export const reconciliationRuns = pgTable("reconciliation_runs", {
  id: id(),
  startedAt: createdAt(),
  finishedAt: ts("finished_at"),
  status: text("status").notNull(), // running | ok | discrepancy | error
  vaultTokenBalance: amount("vault_token_balance"),
  vaultLiquidTracked: amount("vault_liquid_tracked"),
  vaultRheaShares: amount("vault_rhea_shares"),
  rheaReportedShares: amount("rhea_reported_shares"),
  discrepancies: jsonb("discrepancies").$type<{ kind: string; detail: string }[]>().notNull().default([]),
});

/** Financial corrections require a proposer and a different approver. Never edits balances directly. */
export const ledgerAdjustments = pgTable("ledger_adjustments", {
  id: id(),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  description: text("description").notNull(),
  evidence: text("evidence").notNull(),
  status: adjustmentStatus("status").notNull().default("proposed"),
  proposedBy: uuid("proposed_by").notNull().references(() => users.id),
  approvedBy: uuid("approved_by").references(() => users.id),
  createdAt: createdAt(),
  decidedAt: ts("decided_at"),
});

// ------------------------------------------------------------------ platform ops

/** Durable Postgres job queue (SELECT … FOR UPDATE SKIP LOCKED). */
export const jobs = pgTable("jobs", {
  id: id(),
  name: text("name").notNull(),
  payload: jsonb("payload").notNull().default({}),
  status: jobStatus("status").notNull().default("pending"),
  runAt: ts("run_at").notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(8),
  lockedBy: text("locked_by"),
  lockedUntil: ts("locked_until"),
  lastError: text("last_error"),
  idempotencyKey: text("idempotency_key"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("jobs_ready_idx").on(t.status, t.runAt),
  // Unique for all time: a scheduled bucket or period step can never be enqueued twice.
  uniqueIndex("jobs_idem_uq").on(t.idempotencyKey),
]);

export const notifications = pgTable("notifications", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"),
  dedupeKey: text("dedupe_key"),
  readAt: ts("read_at"),
  createdAt: createdAt(),
}, (t) => [index("notifications_user_idx").on(t.userId, t.createdAt), uniqueIndex("notifications_dedupe_uq").on(t.userId, t.dedupeKey)]);

export const moderationReports = pgTable("moderation_reports", {
  id: id(),
  reporterUserId: uuid("reporter_user_id").references(() => users.id),
  targetType: text("target_type").notNull(), // space | campaign | submission | user
  targetId: uuid("target_id").notNull(),
  reason: text("reason").notNull(), // spam | abuse | impersonation | copyright | malicious_link | other
  details: text("details").notNull().default(""),
  status: reportStatus("status").notNull().default("open"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolution: text("resolution"),
  createdAt: createdAt(),
}, (t) => [index("moderation_reports_status_idx").on(t.status, t.createdAt)]);

// ------------------------------------------------------------------ hints, cooperation & expeditions

export const invitationStatus = pgEnum("invitation_status", ["PENDING", "ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"]);
export const verificationStatus = pgEnum("verification_status", ["pending", "under_review", "verified", "failed"]);
export const expeditionStatus = pgEnum("expedition_status", ["DRAFT", "PUBLISHED", "ARCHIVED"]);

/**
 * Optional clues on a treasure question. `content` is secret until unlocked and is never part of a
 * public response. `unlock` is a RuleNode (null = free). Locked with the question once published.
 */
export const treasureHints = pgTable("treasure_hints", {
  id: id(),
  questionId: uuid("question_id").notNull().references(() => treasureQuestions.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  teaser: text("teaser").notNull().default(""),
  content: text("content").notNull(),
  imageUploadId: uuid("image_upload_id").references(() => uploads.id),
  unlock: jsonb("unlock"),
  rulesHash: text("rules_hash").notNull(),
  availableFrom: ts("available_from"),
  availableUntil: ts("available_until"),
  /** What happens if a partner withdraws after launch: "disable" new unlocks or make the hint "free". */
  withdrawalPolicy: text("withdrawal_policy").notNull().default("disable"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("treasure_hints_pos_uq").on(t.questionId, t.position), index("treasure_hints_campaign_idx").on(t.campaignId)]);

export const organizationPartnerships = pgTable("organization_partnerships", {
  id: id(),
  inviterOrgId: uuid("inviter_org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  inviteeOrgId: uuid("invitee_org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  status: invitationStatus("status").notNull().default("PENDING"),
  message: text("message").notNull().default(""),
  invitedBy: uuid("invited_by").notNull().references(() => users.id),
  decidedBy: uuid("decided_by").references(() => users.id),
  expiresAt: ts("expires_at").notNull(),
  decidedAt: ts("decided_at"),
  createdAt: createdAt(),
}, (t) => [
  index("org_partnerships_invitee_idx").on(t.inviteeOrgId, t.status),
  index("org_partnerships_inviter_idx").on(t.inviterOrgId, t.status),
]);

/** An activity an organization owns and makes available to its accepted partners. */
export const activityOfferings = pgTable("activity_offerings", {
  id: id(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  activity: jsonb("activity").notNull(),
  definitionHash: text("definition_hash").notNull(),
  status: text("status").notNull().default("active"), // active | withdrawn
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  withdrawnAt: ts("withdrawn_at"),
}, (t) => [index("activity_offerings_org_idx").on(t.organizationId, t.status)]);

/** Every verification attempt, including pending/under-review ones the worker reconciles. */
export const activityVerifications = pgTable("activity_verifications", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  hintId: uuid("hint_id").notNull().references(() => treasureHints.id, { onDelete: "cascade" }),
  leafId: text("leaf_id").notNull(),
  activityType: text("activity_type").notNull(),
  ownerOrgId: uuid("owner_org_id").notNull().references(() => organizations.id),
  status: verificationStatus("status").notNull().default("pending"),
  /** Player-supplied pointer (tx hash, manual submission). Never treated as proof by itself. */
  input: jsonb("input").notNull().default({}),
  reasonCode: text("reason_code"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: ts("next_attempt_at"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewNote: text("review_note"),
  rulesHash: text("rules_hash").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("activity_verifications_user_idx").on(t.userId, t.hintId),
  index("activity_verifications_review_idx").on(t.ownerOrgId, t.status),
  index("activity_verifications_retry_idx").on(t.status, t.nextAttemptAt),
]);

/** Verified evidence. One per (user, hint, requirement); a transaction can satisfy one requirement per campaign. */
export const activityCompletions = pgTable("activity_completions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  hintId: uuid("hint_id").notNull().references(() => treasureHints.id, { onDelete: "cascade" }),
  leafId: text("leaf_id").notNull(),
  verificationId: uuid("verification_id").references(() => activityVerifications.id),
  provider: text("provider").notNull(),
  evidenceRef: text("evidence_ref").notNull(),
  /** Set for evidence that may not be reused (on-chain tx), unique per campaign. */
  exclusiveRef: text("exclusive_ref"),
  evidence: jsonb("evidence").notNull().default({}),
  verifiedAmount: amount("verified_amount"),
  rulesHash: text("rules_hash").notNull(),
  verifiedAt: ts("verified_at").notNull(),
}, (t) => [
  uniqueIndex("activity_completions_uq").on(t.userId, t.hintId, t.leafId),
  uniqueIndex("activity_completions_exclusive_uq").on(t.campaignId, t.exclusiveRef),
]);

export const hintUnlocks = pgTable("hint_unlocks", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  hintId: uuid("hint_id").notNull().references(() => treasureHints.id, { onDelete: "cascade" }),
  rulesHash: text("rules_hash").notNull(),
  completionIds: jsonb("completion_ids").$type<string[]>().notNull().default([]),
  unlockedAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.hintId] })]);

export const expeditions = pgTable("expeditions", {
  id: id(),
  primaryOrgId: uuid("primary_org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  summary: text("summary").notNull().default(""),
  status: expeditionStatus("status").notNull().default("DRAFT"),
  /** Optional campaign of the primary organizer whose join requires a completed expedition. */
  rewardCampaignId: uuid("reward_campaign_id").references(() => campaigns.id),
  /** Published definition (chapter order + campaigns) and its hash. */
  definition: jsonb("definition"),
  definitionHash: text("definition_hash"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  publishedAt: ts("published_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("expeditions_slug_uq").on(t.slug)]);

export const expeditionPartners = pgTable("expedition_partners", {
  expeditionId: uuid("expedition_id").notNull().references(() => expeditions.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  status: invitationStatus("status").notNull().default("PENDING"),
  invitedBy: uuid("invited_by").notNull().references(() => users.id),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: ts("decided_at"),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.expeditionId, t.organizationId] })]);

export const expeditionChapters = pgTable("expedition_chapters", {
  id: id(),
  expeditionId: uuid("expedition_id").notNull().references(() => expeditions.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  addedBy: uuid("added_by").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("expedition_chapters_pos_uq").on(t.expeditionId, t.position), uniqueIndex("expedition_chapters_campaign_uq").on(t.expeditionId, t.campaignId)]);

export const expeditionProgress = pgTable("expedition_progress", {
  expeditionId: uuid("expedition_id").notNull().references(() => expeditions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  completedChapters: integer("completed_chapters").notNull().default(0),
  definitionHash: text("definition_hash").notNull(),
  completedAt: ts("completed_at"),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.expeditionId, t.userId] })]);

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata").notNull().default({}),
  ipHash: text("ip_hash"),
  createdAt: createdAt(),
}, (t) => [index("audit_logs_target_idx").on(t.targetType, t.targetId), index("audit_logs_created_idx").on(t.createdAt)]);

/** Fixed-window rate limiting without Redis. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").notNull(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.key, t.windowStart] })]);

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
});

/** Launch gates per jurisdiction. Random draws are disabled unless explicitly allowed. */
export const jurisdictionRules = pgTable("jurisdiction_rules", {
  countryCode: text("country_code").primaryKey(),
  participationAllowed: boolean("participation_allowed").notNull().default(true),
  randomDrawAllowed: boolean("random_draw_allowed").notNull().default(false),
  fundingAllowed: boolean("funding_allowed").notNull().default(false),
  notes: text("notes"),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
});

/** Privacy-preserving analytics: visitor hash rotates daily, no raw IPs. */
export const analyticsEvents = pgTable("analytics_events", {
  id: id(),
  kind: text("kind").notNull(), // space_view | campaign_view | campaign_start | campaign_complete | submission
  spaceId: uuid("space_id").references(() => spaces.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
  visitorHash: text("visitor_hash").notNull(),
  day: text("day").notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("analytics_space_idx").on(t.spaceId, t.kind, t.day),
  unique("analytics_dedupe_uq").on(t.kind, t.spaceId, t.campaignId, t.visitorHash, t.day).nullsNotDistinct(),
]);
