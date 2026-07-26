ALTER TABLE "repositories" ADD COLUMN "last_synced_revision" text;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD COLUMN "requested_by_user_id" text;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD COLUMN "stage" text DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sync_jobs_repository_active_unique" ON "sync_jobs" USING btree ("workspace_id","repository_id") WHERE "sync_jobs"."status" in ('queued', 'running');