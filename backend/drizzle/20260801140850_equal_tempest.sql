ALTER TYPE "public"."connector_provider" ADD VALUE 'notion';--> statement-breakpoint
CREATE TABLE "notion_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connector_id" uuid NOT NULL,
	"provider_resource_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"parent_id" text,
	"is_selected" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_edited_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notion_resources" ADD CONSTRAINT "notion_resources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_resources" ADD CONSTRAINT "notion_resources_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notion_resources_connector_provider_id_unique" ON "notion_resources" USING btree ("connector_id","provider_resource_id");--> statement-breakpoint
CREATE INDEX "notion_resources_workspace_id_idx" ON "notion_resources" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "notion_resources_connector_id_idx" ON "notion_resources" USING btree ("connector_id");--> statement-breakpoint
CREATE INDEX "notion_resources_selected_active_idx" ON "notion_resources" USING btree ("connector_id","is_selected","is_active");