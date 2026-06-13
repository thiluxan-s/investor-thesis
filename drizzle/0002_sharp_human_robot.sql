CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'complete', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agent_run_trigger" AS ENUM('manual', 'scheduled');--> statement-breakpoint
CREATE TABLE "agent_run_iterations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"iteration_number" integer NOT NULL,
	"request_messages" jsonb NOT NULL,
	"response_content" jsonb NOT NULL,
	"tool_calls" jsonb,
	"stop_reason" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thesis_id" uuid NOT NULL,
	"status" "agent_run_status" DEFAULT 'queued' NOT NULL,
	"trigger" "agent_run_trigger" NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"iterations_used" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"evidence_collected" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"extracted_text" text NOT NULL,
	"extracted_text_embedding" vector(1536),
	"claim_indices" integer[] DEFAULT '{}' NOT NULL,
	"agent_reasoning" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"url_hash" text NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_content_hash" text,
	"content_excerpt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_url_hash_unique" UNIQUE("url_hash")
);
--> statement-breakpoint
ALTER TABLE "agent_run_iterations" ADD CONSTRAINT "agent_run_iterations_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_thesis_id_theses_id_fk" FOREIGN KEY ("thesis_id") REFERENCES "public"."theses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_iterations_run_iter_idx" ON "agent_run_iterations" USING btree ("agent_run_id","iteration_number");--> statement-breakpoint
CREATE INDEX "agent_runs_thesis_id_idx" ON "agent_runs" USING btree ("thesis_id");--> statement-breakpoint
CREATE INDEX "evidence_agent_run_id_idx" ON "evidence" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "evidence_source_id_idx" ON "evidence" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "sources_domain_idx" ON "sources" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "sources_raw_content_hash_idx" ON "sources" USING btree ("raw_content_hash");