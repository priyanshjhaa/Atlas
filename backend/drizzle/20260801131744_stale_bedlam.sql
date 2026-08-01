CREATE TABLE "repository_commits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"sha" text NOT NULL,
	"message" text NOT NULL,
	"author_name" text,
	"author_login" text,
	"authored_at" timestamp with time zone,
	"committed_at" timestamp with time zone,
	"parent_shas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"html_url" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_file_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"history_range_id" uuid NOT NULL,
	"path" text NOT NULL,
	"previous_path" text,
	"status" text NOT NULL,
	"additions" integer NOT NULL,
	"deletions" integer NOT NULL,
	"changes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_history_ranges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"stable_key" text NOT NULL,
	"base_revision" text,
	"head_revision" text NOT NULL,
	"status" text NOT NULL,
	"ahead_by" integer NOT NULL,
	"behind_by" integer NOT NULL,
	"total_commits" integer NOT NULL,
	"commits_captured" integer NOT NULL,
	"files_captured" integer NOT NULL,
	"commits_truncated" boolean DEFAULT false NOT NULL,
	"files_truncated" boolean DEFAULT false NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repository_commits" ADD CONSTRAINT "repository_commits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_commits" ADD CONSTRAINT "repository_commits_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_file_changes" ADD CONSTRAINT "repository_file_changes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_file_changes" ADD CONSTRAINT "repository_file_changes_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_file_changes" ADD CONSTRAINT "repository_file_changes_history_range_id_repository_history_ranges_id_fk" FOREIGN KEY ("history_range_id") REFERENCES "public"."repository_history_ranges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_history_ranges" ADD CONSTRAINT "repository_history_ranges_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_history_ranges" ADD CONSTRAINT "repository_history_ranges_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repository_commits_repository_sha_unique" ON "repository_commits" USING btree ("repository_id","sha");--> statement-breakpoint
CREATE INDEX "repository_commits_workspace_id_idx" ON "repository_commits" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "repository_commits_repository_id_idx" ON "repository_commits" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "repository_commits_committed_at_idx" ON "repository_commits" USING btree ("committed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_file_changes_range_path_unique" ON "repository_file_changes" USING btree ("history_range_id","path");--> statement-breakpoint
CREATE INDEX "repository_file_changes_workspace_id_idx" ON "repository_file_changes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "repository_file_changes_repository_id_idx" ON "repository_file_changes" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "repository_file_changes_history_range_id_idx" ON "repository_file_changes" USING btree ("history_range_id");--> statement-breakpoint
CREATE INDEX "repository_file_changes_path_idx" ON "repository_file_changes" USING btree ("path");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_history_ranges_repository_stable_key_unique" ON "repository_history_ranges" USING btree ("repository_id","stable_key");--> statement-breakpoint
CREATE INDEX "repository_history_ranges_workspace_id_idx" ON "repository_history_ranges" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "repository_history_ranges_repository_id_idx" ON "repository_history_ranges" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "repository_history_ranges_captured_at_idx" ON "repository_history_ranges" USING btree ("captured_at");