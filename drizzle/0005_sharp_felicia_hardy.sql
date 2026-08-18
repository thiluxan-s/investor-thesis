CREATE TYPE "public"."agent_run_mode" AS ENUM('research', 'challenge');--> statement-breakpoint
CREATE TABLE "challenge_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"thesis_id" uuid NOT NULL,
	"headline" text NOT NULL,
	"summary" text NOT NULL,
	"points" jsonb NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "mode" "agent_run_mode" DEFAULT 'research' NOT NULL;--> statement-breakpoint
ALTER TABLE "challenge_briefs" ADD CONSTRAINT "challenge_briefs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_briefs" ADD CONSTRAINT "challenge_briefs_thesis_id_theses_id_fk" FOREIGN KEY ("thesis_id") REFERENCES "public"."theses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_briefs_run_idx" ON "challenge_briefs" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "challenge_briefs_thesis_created_idx" ON "challenge_briefs" USING btree ("thesis_id","created_at");