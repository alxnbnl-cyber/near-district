CREATE TYPE "public"."expedition_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'under_review', 'verified', 'failed');--> statement-breakpoint
CREATE TABLE "activity_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"hint_id" uuid NOT NULL,
	"leaf_id" text NOT NULL,
	"verification_id" uuid,
	"provider" text NOT NULL,
	"evidence_ref" text NOT NULL,
	"exclusive_ref" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"verified_amount" numeric(78, 0),
	"rules_hash" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"activity" jsonb NOT NULL,
	"definition_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "activity_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"hint_id" uuid NOT NULL,
	"leaf_id" text NOT NULL,
	"activity_type" text NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason_code" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"reviewed_by" uuid,
	"review_note" text,
	"rules_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expedition_chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expedition_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"campaign_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"added_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expedition_partners" (
	"expedition_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" "invitation_status" DEFAULT 'PENDING' NOT NULL,
	"invited_by" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expedition_partners_expedition_id_organization_id_pk" PRIMARY KEY("expedition_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "expedition_progress" (
	"expedition_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"completed_chapters" integer DEFAULT 0 NOT NULL,
	"definition_hash" text NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expedition_progress_expedition_id_user_id_pk" PRIMARY KEY("expedition_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "expeditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"primary_org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"status" "expedition_status" DEFAULT 'DRAFT' NOT NULL,
	"reward_campaign_id" uuid,
	"definition" jsonb,
	"definition_hash" text,
	"created_by" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hint_unlocks" (
	"user_id" uuid NOT NULL,
	"hint_id" uuid NOT NULL,
	"rules_hash" text NOT NULL,
	"completion_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hint_unlocks_user_id_hint_id_pk" PRIMARY KEY("user_id","hint_id")
);
--> statement-breakpoint
CREATE TABLE "organization_partnerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inviter_org_id" uuid NOT NULL,
	"invitee_org_id" uuid NOT NULL,
	"status" "invitation_status" DEFAULT 'PENDING' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"invited_by" uuid NOT NULL,
	"decided_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treasure_hints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"teaser" text DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"image_upload_id" uuid,
	"unlock" jsonb,
	"rules_hash" text NOT NULL,
	"available_from" timestamp with time zone,
	"available_until" timestamp with time zone,
	"withdrawal_policy" text DEFAULT 'disable' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_completions" ADD CONSTRAINT "activity_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_completions" ADD CONSTRAINT "activity_completions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_completions" ADD CONSTRAINT "activity_completions_hint_id_treasure_hints_id_fk" FOREIGN KEY ("hint_id") REFERENCES "public"."treasure_hints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_completions" ADD CONSTRAINT "activity_completions_verification_id_activity_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."activity_verifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_offerings" ADD CONSTRAINT "activity_offerings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_offerings" ADD CONSTRAINT "activity_offerings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_verifications" ADD CONSTRAINT "activity_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_verifications" ADD CONSTRAINT "activity_verifications_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_verifications" ADD CONSTRAINT "activity_verifications_hint_id_treasure_hints_id_fk" FOREIGN KEY ("hint_id") REFERENCES "public"."treasure_hints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_verifications" ADD CONSTRAINT "activity_verifications_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_verifications" ADD CONSTRAINT "activity_verifications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_chapters" ADD CONSTRAINT "expedition_chapters_expedition_id_expeditions_id_fk" FOREIGN KEY ("expedition_id") REFERENCES "public"."expeditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_chapters" ADD CONSTRAINT "expedition_chapters_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_chapters" ADD CONSTRAINT "expedition_chapters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_chapters" ADD CONSTRAINT "expedition_chapters_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_partners" ADD CONSTRAINT "expedition_partners_expedition_id_expeditions_id_fk" FOREIGN KEY ("expedition_id") REFERENCES "public"."expeditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_partners" ADD CONSTRAINT "expedition_partners_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_partners" ADD CONSTRAINT "expedition_partners_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_partners" ADD CONSTRAINT "expedition_partners_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_progress" ADD CONSTRAINT "expedition_progress_expedition_id_expeditions_id_fk" FOREIGN KEY ("expedition_id") REFERENCES "public"."expeditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedition_progress" ADD CONSTRAINT "expedition_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_primary_org_id_organizations_id_fk" FOREIGN KEY ("primary_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_reward_campaign_id_campaigns_id_fk" FOREIGN KEY ("reward_campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hint_unlocks" ADD CONSTRAINT "hint_unlocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hint_unlocks" ADD CONSTRAINT "hint_unlocks_hint_id_treasure_hints_id_fk" FOREIGN KEY ("hint_id") REFERENCES "public"."treasure_hints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_partnerships" ADD CONSTRAINT "organization_partnerships_inviter_org_id_organizations_id_fk" FOREIGN KEY ("inviter_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_partnerships" ADD CONSTRAINT "organization_partnerships_invitee_org_id_organizations_id_fk" FOREIGN KEY ("invitee_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_partnerships" ADD CONSTRAINT "organization_partnerships_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_partnerships" ADD CONSTRAINT "organization_partnerships_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasure_hints" ADD CONSTRAINT "treasure_hints_question_id_treasure_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."treasure_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasure_hints" ADD CONSTRAINT "treasure_hints_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasure_hints" ADD CONSTRAINT "treasure_hints_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_completions_uq" ON "activity_completions" USING btree ("user_id","hint_id","leaf_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_completions_exclusive_uq" ON "activity_completions" USING btree ("campaign_id","exclusive_ref");--> statement-breakpoint
CREATE INDEX "activity_offerings_org_idx" ON "activity_offerings" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "activity_verifications_user_idx" ON "activity_verifications" USING btree ("user_id","hint_id");--> statement-breakpoint
CREATE INDEX "activity_verifications_review_idx" ON "activity_verifications" USING btree ("owner_org_id","status");--> statement-breakpoint
CREATE INDEX "activity_verifications_retry_idx" ON "activity_verifications" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "expedition_chapters_pos_uq" ON "expedition_chapters" USING btree ("expedition_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "expedition_chapters_campaign_uq" ON "expedition_chapters" USING btree ("expedition_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expeditions_slug_uq" ON "expeditions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "org_partnerships_invitee_idx" ON "organization_partnerships" USING btree ("invitee_org_id","status");--> statement-breakpoint
CREATE INDEX "org_partnerships_inviter_idx" ON "organization_partnerships" USING btree ("inviter_org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "treasure_hints_pos_uq" ON "treasure_hints" USING btree ("question_id","position");--> statement-breakpoint
CREATE INDEX "treasure_hints_campaign_idx" ON "treasure_hints" USING btree ("campaign_id");--> statement-breakpoint
-- Cooperation guards enforced by the database, not just the app.
ALTER TABLE "organization_partnerships" ADD CONSTRAINT "org_partnerships_not_self" CHECK ("inviter_org_id" <> "invitee_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_partnerships_open_pair_uq" ON "organization_partnerships" (LEAST("inviter_org_id","invitee_org_id"), GREATEST("inviter_org_id","invitee_org_id")) WHERE "status" IN ('PENDING','ACCEPTED');--> statement-breakpoint
ALTER TABLE "treasure_hints" ADD CONSTRAINT "treasure_hints_policy_chk" CHECK ("withdrawal_policy" IN ('disable','free'));--> statement-breakpoint
ALTER TABLE "activity_offerings" ADD CONSTRAINT "activity_offerings_status_chk" CHECK ("status" IN ('active','withdrawn'));--> statement-breakpoint
ALTER TABLE "expedition_chapters" ADD CONSTRAINT "expedition_chapters_pos_chk" CHECK ("position" >= 0);--> statement-breakpoint
-- Verified evidence and unlocks are immutable once written (deletes only cascade from account removal).
CREATE TRIGGER activity_completions_immutable BEFORE UPDATE ON "activity_completions"
  FOR EACH ROW EXECUTE FUNCTION yielvy_forbid_mutation();--> statement-breakpoint
CREATE TRIGGER hint_unlocks_immutable BEFORE UPDATE ON "hint_unlocks"
  FOR EACH ROW EXECUTE FUNCTION yielvy_forbid_mutation();
