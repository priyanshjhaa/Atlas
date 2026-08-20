CREATE TABLE "notion_context_briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"range_start" timestamp with time zone NOT NULL,
	"range_end" timestamp with time zone NOT NULL,
	"evidence_hash" text NOT NULL,
	"generation_status" text NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_notion_cursors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"acknowledged_through" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notion_context_briefings" ADD CONSTRAINT "notion_context_briefings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_context_briefings" ADD CONSTRAINT "notion_context_briefings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_notion_cursors" ADD CONSTRAINT "workspace_notion_cursors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_notion_cursors" ADD CONSTRAINT "workspace_notion_cursors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notion_context_briefings_range_unique" ON "notion_context_briefings" USING btree ("workspace_id","user_id","range_start","range_end","evidence_hash");--> statement-breakpoint
CREATE INDEX "notion_context_briefings_workspace_id_idx" ON "notion_context_briefings" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "notion_context_briefings_user_id_idx" ON "notion_context_briefings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notion_context_briefings_range_end_idx" ON "notion_context_briefings" USING btree ("range_end");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_notion_cursors_workspace_user_unique" ON "workspace_notion_cursors" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "workspace_notion_cursors_workspace_id_idx" ON "workspace_notion_cursors" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_notion_cursors_user_id_idx" ON "workspace_notion_cursors" USING btree ("user_id");