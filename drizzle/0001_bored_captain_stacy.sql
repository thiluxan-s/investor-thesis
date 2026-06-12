CREATE TYPE "public"."claim_category" AS ENUM('financial_performance', 'product_traction', 'competitive_position', 'macro_environment', 'execution', 'valuation', 'other');--> statement-breakpoint
CREATE TYPE "public"."position_direction" AS ENUM('long', 'short');--> statement-breakpoint
CREATE TYPE "public"."thesis_status" AS ENUM('active', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."time_horizon" AS ENUM('weeks', 'months', '6_to_12_months', 'years');--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thesis_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"statement" text NOT NULL,
	"category" "claim_category" NOT NULL,
	"current_health_score" numeric(3, 2) DEFAULT '0' NOT NULL,
	"current_health_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"ticker" text NOT NULL,
	"position_direction" "position_direction" NOT NULL,
	"time_horizon" time_horizon NOT NULL,
	"status" "thesis_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_thesis_id_theses_id_fk" FOREIGN KEY ("thesis_id") REFERENCES "public"."theses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theses" ADD CONSTRAINT "theses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claims_thesis_id_idx" ON "claims" USING btree ("thesis_id");--> statement-breakpoint
CREATE INDEX "theses_user_id_idx" ON "theses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "theses_user_status_idx" ON "theses" USING btree ("user_id","status");