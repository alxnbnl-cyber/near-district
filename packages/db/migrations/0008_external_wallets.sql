CREATE TABLE "external_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chain" text NOT NULL,
	"address" text NOT NULL,
	"wallet_app" text,
	"verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payout_destination" jsonb;--> statement-breakpoint
ALTER TABLE "external_wallets" ADD CONSTRAINT "external_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_wallets_uq" ON "external_wallets" USING btree ("chain","address");--> statement-breakpoint
CREATE INDEX "external_wallets_user_idx" ON "external_wallets" USING btree ("user_id");