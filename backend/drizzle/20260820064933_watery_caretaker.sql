CREATE TABLE "notion_document_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requested_by_user_id" text,
	"document_id" uuid,
	"current_version_id" uuid,
	"previous_version_id" uuid,
	"document_title" text NOT NULL,
	"document_url" text,
	"current_revision" text NOT NULL,
	"previous_revision" text NOT NULL,
	"current_captured_at" timestamp with time zone NOT NULL,
	"previous_captured_at" timestamp with time zone NOT NULL,
	"evidence_hash" text NOT NULL,
	"generation_status" text NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notion_document_reviews" ADD CONSTRAINT "notion_document_reviews_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_document_reviews" ADD CONSTRAINT "notion_document_reviews_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_document_reviews" ADD CONSTRAINT "notion_document_reviews_document_id_notion_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."notion_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_document_reviews" ADD CONSTRAINT "notion_document_reviews_current_version_id_notion_document_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."notion_document_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_document_reviews" ADD CONSTRAINT "notion_document_reviews_previous_version_id_notion_document_versions_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."notion_document_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notion_document_reviews_comparison_unique" ON "notion_document_reviews" USING btree ("workspace_id","document_id","current_revision","previous_revision","evidence_hash");--> statement-breakpoint
CREATE INDEX "notion_document_reviews_workspace_id_idx" ON "notion_document_reviews" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "notion_document_reviews_document_id_idx" ON "notion_document_reviews" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "notion_document_reviews_requested_by_idx" ON "notion_document_reviews" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "notion_document_reviews_created_at_idx" ON "notion_document_reviews" USING btree ("created_at");