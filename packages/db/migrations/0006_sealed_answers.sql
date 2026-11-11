CREATE TABLE "sealed_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer_cipher" text NOT NULL,
	"correct" boolean NOT NULL,
	"submission_digest" text NOT NULL,
	"edits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "treasure_questions" ADD COLUMN "reveal_text" text;--> statement-breakpoint
ALTER TABLE "sealed_answers" ADD CONSTRAINT "sealed_answers_entry_id_participant_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."participant_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sealed_answers" ADD CONSTRAINT "sealed_answers_question_id_treasure_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."treasure_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sealed_answers_uq" ON "sealed_answers" USING btree ("entry_id","question_id");