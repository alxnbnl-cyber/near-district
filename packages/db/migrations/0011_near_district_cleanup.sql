DROP TABLE "email_login_tokens" CASCADE;--> statement-breakpoint
DROP TABLE "external_wallets" CASCADE;--> statement-breakpoint
DROP TABLE "partner_app_keys" CASCADE;--> statement-breakpoint
DROP TABLE "partner_events" CASCADE;--> statement-breakpoint
DROP TABLE "partner_link_codes" CASCADE;--> statement-breakpoint
ALTER TABLE "jurisdiction_rules" DROP COLUMN "random_draw_allowed";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "payout_destination";