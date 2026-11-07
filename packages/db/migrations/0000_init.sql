CREATE TYPE "public"."adjustment_status" AS ENUM('proposed', 'approved', 'rejected', 'applied');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('superadmin', 'finance', 'moderator', 'support');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('DRAFT', 'PENDING_FUNDING', 'SCHEDULED', 'LIVE', 'PAUSED', 'ENDED', 'AWAITING_RESULTS', 'COMPLETED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."campaign_template" AS ENUM('treasure_hunt', 'creative_contest', 'product_explorer', 'more_experiences');--> statement-breakpoint
CREATE TYPE "public"."chain_op_status" AS ENUM('queued', 'submitted', 'succeeded', 'failed', 'requires_review');--> statement-breakpoint
CREATE TYPE "public"."claim_state" AS ENUM('AVAILABLE', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('in_progress', 'completed', 'disqualified');--> statement-breakpoint
CREATE TYPE "public"."funding_kind" AS ENUM('principal', 'bonus');--> statement-breakpoint
CREATE TYPE "public"."funding_route" AS ENUM('native', 'intents');--> statement-breakpoint
CREATE TYPE "public"."funding_state" AS ENUM('CREATED', 'QUOTED', 'AWAITING_PAYMENT', 'DETECTED', 'SETTLING', 'RECEIVED', 'SUPPLY_PENDING', 'SUPPLIED', 'EXPIRED', 'INCOMPLETE', 'REFUNDED', 'FAILED', 'REQUIRES_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."identity_provider" AS ENUM('email', 'near');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'done', 'dead');--> statement-breakpoint
CREATE TYPE "public"."ledger_bucket" AS ENUM('principal_idle', 'principal_supplied', 'yield_available', 'bonus_available', 'reserved', 'claimed', 'fees', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('owner', 'admin', 'editor', 'reviewer');--> statement-breakpoint
CREATE TYPE "public"."qualification_status" AS ENUM('qualified', 'held', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('short_text', 'multiple_choice', 'numeric');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."reward_period_state" AS ENUM('SCHEDULED', 'ELIGIBILITY_FROZEN', 'YIELD_SETTLEMENT_PENDING', 'FUNDS_RESERVED', 'WINNERS_FINALIZED', 'CLAIMABLE', 'COMPLETED', 'VETOED', 'NO_WINNERS', 'REQUIRES_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('submitted', 'shortlisted', 'rejected', 'winner', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_state" AS ENUM('REQUESTED', 'VALIDATING', 'REDEMPTION_PENDING', 'REDEEMED', 'TRANSFER_PENDING', 'CONFIRMED', 'LIQUIDITY_WAIT', 'REJECTED', 'FAILED', 'REQUIRES_REVIEW');--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"user_id" uuid NOT NULL,
	"role" "admin_role" NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"space_id" uuid,
	"campaign_id" uuid,
	"visitor_hash" text NOT NULL,
	"day" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_dedupe_uq" UNIQUE NULLS NOT DISTINCT("kind","space_id","campaign_id","visitor_hash","day")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nonce" text NOT NULL,
	"purpose" text NOT NULL,
	"user_id" uuid,
	"recipient" text NOT NULL,
	"message" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blockchain_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"campaign_id" uuid,
	"status" "chain_op_status" DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"args" jsonb NOT NULL,
	"tx_hash" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"rules" jsonb NOT NULL,
	"rules_hash" text NOT NULL,
	"change_notice" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"template" "campaign_template" NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cover_upload_id" uuid,
	"status" "campaign_status" DEFAULT 'DRAFT' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"current_version" integer,
	"network" text NOT NULL,
	"vault_campaign_id" bigint,
	"featured" boolean DEFAULT false NOT NULL,
	"moderation" "moderation_status" DEFAULT 'approved' NOT NULL,
	"created_by" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text NOT NULL,
	"tx_hash" text NOT NULL,
	"signer_id" text NOT NULL,
	"receiver_id" text NOT NULL,
	"status" text NOT NULL,
	"block_height" bigint,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"external_url" text,
	"image_upload_id" uuid,
	"status" "submission_status" DEFAULT 'submitted' NOT NULL,
	"moderation" "moderation_status" DEFAULT 'approved' NOT NULL,
	"rules_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eligibility_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reward_period_id" uuid NOT NULL,
	"commitment" text NOT NULL,
	"participant_count" integer NOT NULL,
	"participants" jsonb NOT NULL,
	"commit_tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"organizer_user_id" uuid NOT NULL,
	"kind" "funding_kind" NOT NULL,
	"route" "funding_route" NOT NULL,
	"state" "funding_state" DEFAULT 'CREATED' NOT NULL,
	"token_id" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"received_amount" numeric(78, 0),
	"sponsor_account_id" text NOT NULL,
	"intents_quote" jsonb,
	"intents_deposit_address" text,
	"intents_origin_asset" text,
	"intents_status" text,
	"origin_tx_hash" text,
	"near_tx_hash" text,
	"expires_at" timestamp with time zone,
	"failure_reason" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jurisdiction_rules" (
	"country_code" text PRIMARY KEY NOT NULL,
	"participation_allowed" boolean DEFAULT true NOT NULL,
	"random_draw_allowed" boolean DEFAULT false NOT NULL,
	"funding_allowed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid,
	"description" text NOT NULL,
	"evidence" text NOT NULL,
	"status" "adjustment_status" DEFAULT 'proposed' NOT NULL,
	"proposed_by" uuid NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid,
	"bucket" "ledger_bucket" NOT NULL,
	"delta" numeric(78, 0) NOT NULL,
	"event_type" text NOT NULL,
	"event_ref" text NOT NULL,
	"tx_hash" text NOT NULL,
	"block_height" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "org_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "moderation_status" DEFAULT 'pending' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "entry_status" DEFAULT 'in_progress' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"rules_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"status" "qualification_status" DEFAULT 'qualified' NOT NULL,
	"hold_reason" text,
	"qualified_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"correct" boolean NOT NULL,
	"submission_digest" text NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"vault_token_balance" numeric(78, 0),
	"vault_liquid_tracked" numeric(78, 0),
	"vault_rhea_shares" numeric(78, 0),
	"rhea_reported_shares" numeric(78, 0),
	"discrepancies" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reward_period_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"rank" integer,
	"proof" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"allocation_id" uuid NOT NULL,
	"state" "claim_state" DEFAULT 'AVAILABLE' NOT NULL,
	"tx_hash" text,
	"failure_reason" text,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"period_number" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"state" "reward_period_state" DEFAULT 'SCHEDULED' NOT NULL,
	"seed" text,
	"allocation_root" text,
	"allocated_total" numeric(78, 0),
	"reserved_yield" numeric(78, 0) DEFAULT 0 NOT NULL,
	"reserved_bonus" numeric(78, 0) DEFAULT 0 NOT NULL,
	"claimable_after" timestamp with time zone,
	"claim_deadline" timestamp with time zone,
	"blocked_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_reserves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reward_period_id" uuid NOT NULL,
	"from_yield" numeric(78, 0) NOT NULL,
	"from_bonus" numeric(78, 0) NOT NULL,
	"tx_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_verified_at" timestamp with time zone,
	"user_agent" text,
	"ip_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"website_url" text,
	"socials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"logo_upload_id" uuid,
	"banner_upload_id" uuid,
	"building_style" text DEFAULT 'workshop' NOT NULL,
	"accent_color" text,
	"moderation" "moderation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"scores" jsonb NOT NULL,
	"weighted_score" integer NOT NULL,
	"private_note" text,
	"decision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treasure_answer_rules" (
	"question_id" uuid PRIMARY KEY NOT NULL,
	"salt" text NOT NULL,
	"ciphertext" text NOT NULL,
	"key_version" smallint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treasure_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" "question_type" NOT NULL,
	"prompt" text NOT NULL,
	"clue" text,
	"options" jsonb,
	"image_upload_id" uuid,
	"reference_url" text,
	"difficulty" smallint DEFAULT 1 NOT NULL,
	"max_attempts" integer DEFAULT 10 NOT NULL,
	"cooldown_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"organization_id" uuid,
	"purpose" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" text NOT NULL,
	"moderation" "moderation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "identity_provider" NOT NULL,
	"subject" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"suspended_reason" text,
	"country_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"block_height" bigint NOT NULL,
	"principal_idle" numeric(78, 0) NOT NULL,
	"principal_supplied" numeric(78, 0) NOT NULL,
	"rhea_shares" numeric(78, 0) NOT NULL,
	"position_value" numeric(78, 0) NOT NULL,
	"yield_available" numeric(78, 0) NOT NULL,
	"bonus_available" numeric(78, 0) NOT NULL,
	"reserved" numeric(78, 0) NOT NULL,
	"claimed_total" numeric(78, 0) NOT NULL,
	"observed_supply_apr" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vaults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text NOT NULL,
	"contract_id" text NOT NULL,
	"token_id" text NOT NULL,
	"lending_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"network" text NOT NULL,
	"account_id" text NOT NULL,
	"public_key" text NOT NULL,
	"is_payout" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawal_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"state" "withdrawal_state" DEFAULT 'REQUESTED' NOT NULL,
	"principal_amount" numeric(78, 0) NOT NULL,
	"yield_amount" numeric(78, 0) NOT NULL,
	"bonus_amount" numeric(78, 0) NOT NULL,
	"destination_account_id" text NOT NULL,
	"tx_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failure_reason" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_buildings" (
	"space_id" uuid PRIMARY KEY NOT NULL,
	"district_id" text NOT NULL,
	"plot_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_districts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tagline" text NOT NULL,
	"sort_order" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yield_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"vault_op_id" bigint,
	"state" text NOT NULL,
	"requested" numeric(78, 0),
	"received" numeric(78, 0),
	"fee" numeric(78, 0),
	"abort_reason" text,
	"tx_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blockchain_operations" ADD CONSTRAINT "blockchain_operations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_versions" ADD CONSTRAINT "campaign_versions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_versions" ADD CONSTRAINT "campaign_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_cover_upload_id_uploads_id_fk" FOREIGN KEY ("cover_upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_submissions" ADD CONSTRAINT "creative_submissions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_submissions" ADD CONSTRAINT "creative_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_submissions" ADD CONSTRAINT "creative_submissions_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_snapshots" ADD CONSTRAINT "eligibility_snapshots_reward_period_id_reward_periods_id_fk" FOREIGN KEY ("reward_period_id") REFERENCES "public"."reward_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_orders" ADD CONSTRAINT "funding_orders_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_orders" ADD CONSTRAINT "funding_orders_organizer_user_id_users_id_fk" FOREIGN KEY ("organizer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jurisdiction_rules" ADD CONSTRAINT "jurisdiction_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_adjustments" ADD CONSTRAINT "ledger_adjustments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_adjustments" ADD CONSTRAINT "ledger_adjustments_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_adjustments" ADD CONSTRAINT "ledger_adjustments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_entries" ADD CONSTRAINT "participant_entries_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_entries" ADD CONSTRAINT "participant_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_entry_id_participant_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."participant_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_question_id_treasure_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."treasure_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_allocations" ADD CONSTRAINT "reward_allocations_reward_period_id_reward_periods_id_fk" FOREIGN KEY ("reward_period_id") REFERENCES "public"."reward_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_allocations" ADD CONSTRAINT "reward_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_allocation_id_reward_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."reward_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_periods" ADD CONSTRAINT "reward_periods_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_reserves" ADD CONSTRAINT "reward_reserves_reward_period_id_reward_periods_id_fk" FOREIGN KEY ("reward_period_id") REFERENCES "public"."reward_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_logo_upload_id_uploads_id_fk" FOREIGN KEY ("logo_upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_banner_upload_id_uploads_id_fk" FOREIGN KEY ("banner_upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_reviews" ADD CONSTRAINT "submission_reviews_submission_id_creative_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."creative_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_reviews" ADD CONSTRAINT "submission_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasure_answer_rules" ADD CONSTRAINT "treasure_answer_rules_question_id_treasure_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."treasure_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasure_questions" ADD CONSTRAINT "treasure_questions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasure_questions" ADD CONSTRAINT "treasure_questions_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_positions" ADD CONSTRAINT "vault_positions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_connections" ADD CONSTRAINT "wallet_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_buildings" ADD CONSTRAINT "world_buildings_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_buildings" ADD CONSTRAINT "world_buildings_district_id_world_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."world_districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yield_settlements" ADD CONSTRAINT "yield_settlements_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_space_idx" ON "analytics_events" USING btree ("space_id","kind","day");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_challenges_nonce_uq" ON "auth_challenges" USING btree ("nonce");--> statement-breakpoint
CREATE UNIQUE INDEX "blockchain_operations_idem_uq" ON "blockchain_operations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "blockchain_operations_status_idx" ON "blockchain_operations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_versions_uq" ON "campaign_versions" USING btree ("campaign_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_space_slug_uq" ON "campaigns" USING btree ("space_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_vault_id_uq" ON "campaigns" USING btree ("network","vault_campaign_id");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_transactions_uq" ON "chain_transactions" USING btree ("network","tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_submissions_uq" ON "creative_submissions" USING btree ("campaign_id","user_id");--> statement-breakpoint
CREATE INDEX "creative_submissions_status_idx" ON "creative_submissions" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "eligibility_snapshots_period_uq" ON "eligibility_snapshots" USING btree ("reward_period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_login_tokens_hash_uq" ON "email_login_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "email_login_tokens_email_idx" ON "email_login_tokens" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "funding_orders_idem_uq" ON "funding_orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "funding_orders_near_tx_uq" ON "funding_orders" USING btree ("near_tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "funding_orders_deposit_addr_uq" ON "funding_orders" USING btree ("intents_deposit_address");--> statement-breakpoint
CREATE INDEX "funding_orders_state_idx" ON "funding_orders" USING btree ("state");--> statement-breakpoint
CREATE INDEX "jobs_ready_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idem_uq" ON "jobs" USING btree ("idempotency_key") WHERE "jobs"."status" in ('pending','running');--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_ref_uq" ON "ledger_entries" USING btree ("event_ref");--> statement-breakpoint
CREATE INDEX "ledger_entries_campaign_idx" ON "ledger_entries" USING btree ("campaign_id","bucket");--> statement-breakpoint
CREATE INDEX "moderation_reports_status_idx" ON "moderation_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uq" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_entries_uq" ON "participant_entries" USING btree ("campaign_id","user_id");--> statement-breakpoint
CREATE INDEX "participant_entries_campaign_idx" ON "participant_entries" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "qualifications_uq" ON "qualifications" USING btree ("campaign_id","user_id");--> statement-breakpoint
CREATE INDEX "question_attempts_entry_q_idx" ON "question_attempts" USING btree ("entry_id","question_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_allocations_uq" ON "reward_allocations" USING btree ("reward_period_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_claims_allocation_uq" ON "reward_claims" USING btree ("allocation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_periods_uq" ON "reward_periods" USING btree ("campaign_id","period_number");--> statement-breakpoint
CREATE INDEX "reward_periods_state_idx" ON "reward_periods" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_reserves_tx_uq" ON "reward_reserves" USING btree ("tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_org_uq" ON "spaces" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_slug_uq" ON "spaces" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "submission_reviews_sub_idx" ON "submission_reviews" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "treasure_questions_pos_uq" ON "treasure_questions" USING btree ("campaign_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "uploads_storage_key_uq" ON "uploads" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_provider_subject_uq" ON "user_identities" USING btree ("provider","subject");--> statement-breakpoint
CREATE INDEX "user_identities_user_idx" ON "user_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "vault_positions_campaign_idx" ON "vault_positions" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vaults_uq" ON "vaults" USING btree ("network","contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_connections_network_account_uq" ON "wallet_connections" USING btree ("network","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_connections_one_payout_uq" ON "wallet_connections" USING btree ("user_id","network") WHERE "wallet_connections"."is_payout";--> statement-breakpoint
CREATE UNIQUE INDEX "withdrawal_requests_idem_uq" ON "withdrawal_requests" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "world_buildings_plot_uq" ON "world_buildings" USING btree ("district_id","plot_index");