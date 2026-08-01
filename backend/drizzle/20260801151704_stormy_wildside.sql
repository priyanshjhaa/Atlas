CREATE TABLE "notion_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"source_revision" text NOT NULL,
	"content" text NOT NULL,
	"citation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notion_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connector_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"source_revision" text NOT NULL,
	"citation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notion_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connector_id" uuid NOT NULL,
	"requested_by_user_id" text,
	"status" "sync_job_status" DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"stage" text DEFAULT 'queued' NOT NULL,
	"result" jsonb,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notion_document_versions" ADD CONSTRAINT "notion_document_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_document_versions" ADD CONSTRAINT "notion_document_versions_document_id_notion_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."notion_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_documents" ADD CONSTRAINT "notion_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_documents" ADD CONSTRAINT "notion_documents_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_documents" ADD CONSTRAINT "notion_documents_resource_id_notion_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."notion_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_sync_jobs" ADD CONSTRAINT "notion_sync_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_sync_jobs" ADD CONSTRAINT "notion_sync_jobs_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_sync_jobs" ADD CONSTRAINT "notion_sync_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notion_document_versions_document_hash_unique" ON "notion_document_versions" USING btree ("document_id","content_hash");--> statement-breakpoint
CREATE INDEX "notion_document_versions_workspace_id_idx" ON "notion_document_versions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "notion_document_versions_document_id_idx" ON "notion_document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "notion_document_versions_captured_at_idx" ON "notion_document_versions" USING btree ("captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notion_documents_resource_id_unique" ON "notion_documents" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "notion_documents_workspace_id_idx" ON "notion_documents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "notion_documents_connector_id_idx" ON "notion_documents" USING btree ("connector_id");--> statement-breakpoint
CREATE INDEX "notion_documents_content_hash_idx" ON "notion_documents" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "notion_sync_jobs_workspace_idempotency_unique" ON "notion_sync_jobs" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notion_sync_jobs_connector_active_unique" ON "notion_sync_jobs" USING btree ("workspace_id","connector_id") WHERE "notion_sync_jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "notion_sync_jobs_workspace_id_idx" ON "notion_sync_jobs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "notion_sync_jobs_connector_id_idx" ON "notion_sync_jobs" USING btree ("connector_id");--> statement-breakpoint
CREATE INDEX "notion_sync_jobs_status_idx" ON "notion_sync_jobs" USING btree ("status");