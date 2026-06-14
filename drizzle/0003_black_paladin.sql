CREATE TYPE "public"."evidence_impact" AS ENUM('strengthens', 'neutral', 'weakens');--> statement-breakpoint
CREATE TABLE "claim_evidence_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"impact" "evidence_impact" NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"reasoning" text NOT NULL,
	"evaluator_prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thesis_health_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thesis_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"overall_score" numeric(3, 2) NOT NULL,
	"claim_scores" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_evidence_links" ADD CONSTRAINT "claim_evidence_links_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_evidence_links" ADD CONSTRAINT "claim_evidence_links_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thesis_health_snapshots" ADD CONSTRAINT "thesis_health_snapshots_thesis_id_theses_id_fk" FOREIGN KEY ("thesis_id") REFERENCES "public"."theses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thesis_health_snapshots" ADD CONSTRAINT "thesis_health_snapshots_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_evidence_links_pair_idx" ON "claim_evidence_links" USING btree ("claim_id","evidence_id");--> statement-breakpoint
CREATE INDEX "claim_evidence_links_claim_id_idx" ON "claim_evidence_links" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "thesis_health_snapshots_run_idx" ON "thesis_health_snapshots" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "thesis_health_snapshots_thesis_recorded_idx" ON "thesis_health_snapshots" USING btree ("thesis_id","recorded_at");