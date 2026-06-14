CREATE TYPE "public"."digest_batch_status" AS ENUM('pending', 'sending', 'sent', 'skipped');--> statement-breakpoint
CREATE TABLE "digest_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_of" date NOT NULL,
	"expected_runs" integer NOT NULL,
	"completed_runs" integer DEFAULT 0 NOT NULL,
	"status" "digest_batch_status" DEFAULT 'pending' NOT NULL,
	"digest_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "digest_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "digest_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "digest_batches" ADD CONSTRAINT "digest_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "digest_batches_user_week_idx" ON "digest_batches" USING btree ("user_id","week_of");--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_digest_batch_id_digest_batches_id_fk" FOREIGN KEY ("digest_batch_id") REFERENCES "public"."digest_batches"("id") ON DELETE set null ON UPDATE no action;