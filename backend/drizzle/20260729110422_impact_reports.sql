CREATE TABLE "impact_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"requested_by_user_id" text,
	"source_revision" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "impact_reports" ADD CONSTRAINT "impact_reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_reports" ADD CONSTRAINT "impact_reports_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_reports" ADD CONSTRAINT "impact_reports_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "impact_reports_workspace_id_idx" ON "impact_reports" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "impact_reports_repository_id_idx" ON "impact_reports" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "impact_reports_requested_by_user_id_idx" ON "impact_reports" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "impact_reports_created_at_idx" ON "impact_reports" USING btree ("created_at");