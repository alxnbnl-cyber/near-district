ALTER TABLE "campaigns" ADD COLUMN "draft_rules" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "allowed_countries" jsonb;