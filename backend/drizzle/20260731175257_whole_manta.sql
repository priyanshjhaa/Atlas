CREATE TABLE "relationship_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"observed_by_repository_id" uuid NOT NULL,
	"observed_revision" text NOT NULL,
	"source_repository_id" uuid NOT NULL,
	"source_entity_kind" text NOT NULL,
	"source_entity_key" text NOT NULL,
	"target_repository_id" uuid NOT NULL,
	"target_entity_kind" text NOT NULL,
	"target_entity_key" text NOT NULL,
	"kind" text NOT NULL,
	"stable_key" text NOT NULL,
	"provenance" text NOT NULL,
	"confidence" real NOT NULL,
	"source_revision" text NOT NULL,
	"target_revision" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "relationship_observations" ADD CONSTRAINT "relationship_observations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_observations" ADD CONSTRAINT "relationship_observations_observed_by_repository_id_repositories_id_fk" FOREIGN KEY ("observed_by_repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_observations" ADD CONSTRAINT "relationship_observations_source_repository_id_repositories_id_fk" FOREIGN KEY ("source_repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_observations" ADD CONSTRAINT "relationship_observations_target_repository_id_repositories_id_fk" FOREIGN KEY ("target_repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_observations_revision_stable_key_unique" ON "relationship_observations" USING btree ("workspace_id","observed_by_repository_id","observed_revision","stable_key");--> statement-breakpoint
CREATE INDEX "relationship_observations_workspace_id_idx" ON "relationship_observations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "relationship_observations_observer_revision_idx" ON "relationship_observations" USING btree ("observed_by_repository_id","observed_revision");--> statement-breakpoint
CREATE INDEX "relationship_observations_source_repository_id_idx" ON "relationship_observations" USING btree ("source_repository_id");--> statement-breakpoint
CREATE INDEX "relationship_observations_target_repository_id_idx" ON "relationship_observations" USING btree ("target_repository_id");--> statement-breakpoint
CREATE INDEX "relationship_observations_stable_key_idx" ON "relationship_observations" USING btree ("stable_key");