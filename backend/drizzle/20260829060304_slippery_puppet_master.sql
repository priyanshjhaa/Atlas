CREATE TABLE "repository_pull_request_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"pull_request_id" uuid NOT NULL,
	"provider_review_id" text NOT NULL,
	"reviewer" jsonb,
	"state" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"provider_pull_request_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"state" text NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"author" jsonb,
	"merged_by" jsonb,
	"base_revision" text NOT NULL,
	"head_revision" text NOT NULL,
	"reviews_truncated" boolean DEFAULT false NOT NULL,
	"provider_created_at" timestamp with time zone NOT NULL,
	"provider_updated_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"merged_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repository_pull_request_reviews" ADD CONSTRAINT "repository_pull_request_reviews_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_pull_request_reviews" ADD CONSTRAINT "repository_pull_request_reviews_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_pull_request_reviews" ADD CONSTRAINT "repository_pull_request_reviews_pull_request_id_repository_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."repository_pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_pull_requests" ADD CONSTRAINT "repository_pull_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_pull_requests" ADD CONSTRAINT "repository_pull_requests_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repository_pull_request_reviews_pr_provider_id_unique" ON "repository_pull_request_reviews" USING btree ("pull_request_id","provider_review_id");--> statement-breakpoint
CREATE INDEX "repository_pull_request_reviews_workspace_id_idx" ON "repository_pull_request_reviews" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "repository_pull_request_reviews_repository_id_idx" ON "repository_pull_request_reviews" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "repository_pull_request_reviews_pull_request_id_idx" ON "repository_pull_request_reviews" USING btree ("pull_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_pull_requests_repository_number_unique" ON "repository_pull_requests" USING btree ("repository_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_pull_requests_repository_provider_id_unique" ON "repository_pull_requests" USING btree ("repository_id","provider_pull_request_id");--> statement-breakpoint
CREATE INDEX "repository_pull_requests_workspace_id_idx" ON "repository_pull_requests" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "repository_pull_requests_repository_id_idx" ON "repository_pull_requests" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "repository_pull_requests_updated_at_idx" ON "repository_pull_requests" USING btree ("repository_id","provider_updated_at");