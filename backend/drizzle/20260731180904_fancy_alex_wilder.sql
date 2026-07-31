CREATE TYPE "public"."graph_relationship_classification" AS ENUM('observed', 'historical', 'inferred');--> statement-breakpoint
CREATE TABLE "graph_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"stable_key" text NOT NULL,
	"name" text NOT NULL,
	"path" text,
	"source_revision" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_repository_id" uuid NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"target_repository_id" uuid NOT NULL,
	"target_entity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"stable_key" text NOT NULL,
	"classification" "graph_relationship_classification" NOT NULL,
	"provenance" text NOT NULL,
	"confidence" real NOT NULL,
	"source_revision" text NOT NULL,
	"target_revision" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "graph_entities" ADD CONSTRAINT "graph_entities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_entities" ADD CONSTRAINT "graph_entities_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_relationships" ADD CONSTRAINT "graph_relationships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_relationships" ADD CONSTRAINT "graph_relationships_source_repository_id_repositories_id_fk" FOREIGN KEY ("source_repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_relationships" ADD CONSTRAINT "graph_relationships_source_entity_id_graph_entities_id_fk" FOREIGN KEY ("source_entity_id") REFERENCES "public"."graph_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_relationships" ADD CONSTRAINT "graph_relationships_target_repository_id_repositories_id_fk" FOREIGN KEY ("target_repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_relationships" ADD CONSTRAINT "graph_relationships_target_entity_id_graph_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."graph_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "graph_entities_repository_type_stable_key_unique" ON "graph_entities" USING btree ("repository_id","entity_type","stable_key");--> statement-breakpoint
CREATE INDEX "graph_entities_workspace_id_idx" ON "graph_entities" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "graph_entities_repository_id_idx" ON "graph_entities" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "graph_entities_workspace_type_current_idx" ON "graph_entities" USING btree ("workspace_id","entity_type","is_current");--> statement-breakpoint
CREATE UNIQUE INDEX "graph_relationships_workspace_stable_key_unique" ON "graph_relationships" USING btree ("workspace_id","stable_key");--> statement-breakpoint
CREATE INDEX "graph_relationships_workspace_id_idx" ON "graph_relationships" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "graph_relationships_source_repository_id_idx" ON "graph_relationships" USING btree ("source_repository_id");--> statement-breakpoint
CREATE INDEX "graph_relationships_target_repository_id_idx" ON "graph_relationships" USING btree ("target_repository_id");--> statement-breakpoint
CREATE INDEX "graph_relationships_source_entity_id_idx" ON "graph_relationships" USING btree ("source_entity_id");--> statement-breakpoint
CREATE INDEX "graph_relationships_target_entity_id_idx" ON "graph_relationships" USING btree ("target_entity_id");--> statement-breakpoint
CREATE INDEX "graph_relationships_workspace_classification_current_idx" ON "graph_relationships" USING btree ("workspace_id","classification","is_current");