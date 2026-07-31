CREATE TABLE "code_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"stable_key" text NOT NULL,
	"name" text NOT NULL,
	"version" text,
	"root_path" text NOT NULL,
	"manifest_path" text NOT NULL,
	"entry_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_revision" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_repository_id" uuid NOT NULL,
	"source_package_id" uuid NOT NULL,
	"target_repository_id" uuid NOT NULL,
	"target_package_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"stable_key" text NOT NULL,
	"provenance" text NOT NULL,
	"confidence" real NOT NULL,
	"source_revision" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "code_packages" ADD CONSTRAINT "code_packages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_packages" ADD CONSTRAINT "code_packages_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_relationships" ADD CONSTRAINT "package_relationships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_relationships" ADD CONSTRAINT "package_relationships_source_repository_id_repositories_id_fk" FOREIGN KEY ("source_repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_relationships" ADD CONSTRAINT "package_relationships_source_package_id_code_packages_id_fk" FOREIGN KEY ("source_package_id") REFERENCES "public"."code_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_relationships" ADD CONSTRAINT "package_relationships_target_repository_id_repositories_id_fk" FOREIGN KEY ("target_repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_relationships" ADD CONSTRAINT "package_relationships_target_package_id_code_packages_id_fk" FOREIGN KEY ("target_package_id") REFERENCES "public"."code_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "code_packages_repository_stable_key_unique" ON "code_packages" USING btree ("repository_id","stable_key");--> statement-breakpoint
CREATE INDEX "code_packages_workspace_name_idx" ON "code_packages" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "code_packages_repository_id_idx" ON "code_packages" USING btree ("repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX "package_relationships_workspace_stable_key_unique" ON "package_relationships" USING btree ("workspace_id","stable_key");--> statement-breakpoint
CREATE INDEX "package_relationships_workspace_id_idx" ON "package_relationships" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "package_relationships_source_repository_id_idx" ON "package_relationships" USING btree ("source_repository_id");--> statement-breakpoint
CREATE INDEX "package_relationships_target_repository_id_idx" ON "package_relationships" USING btree ("target_repository_id");--> statement-breakpoint
CREATE INDEX "package_relationships_source_package_id_idx" ON "package_relationships" USING btree ("source_package_id");--> statement-breakpoint
CREATE INDEX "package_relationships_target_package_id_idx" ON "package_relationships" USING btree ("target_package_id");