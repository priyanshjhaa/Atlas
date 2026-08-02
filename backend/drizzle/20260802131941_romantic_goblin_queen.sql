CREATE TYPE "public"."impact_feedback_rating" AS ENUM('useful', 'not_useful');--> statement-breakpoint
CREATE TABLE "impact_report_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"rating" "impact_feedback_rating" NOT NULL,
	"confirmed_finding_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missed_impact" text,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "impact_report_feedback" ADD CONSTRAINT "impact_report_feedback_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_report_feedback" ADD CONSTRAINT "impact_report_feedback_report_id_impact_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."impact_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_report_feedback" ADD CONSTRAINT "impact_report_feedback_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "impact_report_feedback_report_user_unique" ON "impact_report_feedback" USING btree ("report_id","submitted_by_user_id");--> statement-breakpoint
CREATE INDEX "impact_report_feedback_workspace_id_idx" ON "impact_report_feedback" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "impact_report_feedback_report_id_idx" ON "impact_report_feedback" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "impact_report_feedback_rating_idx" ON "impact_report_feedback" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "impact_report_feedback_created_at_idx" ON "impact_report_feedback" USING btree ("created_at");