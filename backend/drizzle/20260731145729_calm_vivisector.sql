CREATE TABLE "code_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"stable_key" text NOT NULL,
	"specifier" text NOT NULL,
	"line" integer NOT NULL,
	"bindings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_revision" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symbol_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_repository_id" uuid NOT NULL,
	"source_file_id" uuid NOT NULL,
	"target_repository_id" uuid NOT NULL,
	"target_symbol_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"stable_key" text NOT NULL,
	"provenance" text NOT NULL,
	"confidence" real NOT NULL,
	"source_revision" text NOT NULL,
	"target_revision" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "code_packages" ADD COLUMN "export_mappings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "code_symbols" ADD COLUMN "package_id" uuid;--> statement-breakpoint
ALTER TABLE "code_symbols" ADD COLUMN "qualified_name" text;--> statement-breakpoint
ALTER TABLE "code_symbols" ADD COLUMN "public_api" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "code_symbols" ADD COLUMN "export_names" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "code_symbols" ADD COLUMN "api_specifiers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "code_symbols" ADD COLUMN "source_revision" text;--> statement-breakpoint
ALTER TABLE "code_imports" ADD CONSTRAINT "code_imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_imports" ADD CONSTRAINT "code_imports_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_imports" ADD CONSTRAINT "code_imports_file_id_code_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_relationships" ADD CONSTRAINT "symbol_relationships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_relationships" ADD CONSTRAINT "symbol_relationships_source_repository_id_repositories_id_fk" FOREIGN KEY ("source_repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_relationships" ADD CONSTRAINT "symbol_relationships_source_file_id_code_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_relationships" ADD CONSTRAINT "symbol_relationships_target_repository_id_repositories_id_fk" FOREIGN KEY ("target_repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_relationships" ADD CONSTRAINT "symbol_relationships_target_symbol_id_code_symbols_id_fk" FOREIGN KEY ("target_symbol_id") REFERENCES "public"."code_symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "code_imports_repository_stable_key_unique" ON "code_imports" USING btree ("repository_id","stable_key");--> statement-breakpoint
CREATE INDEX "code_imports_workspace_id_idx" ON "code_imports" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "code_imports_repository_id_idx" ON "code_imports" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "code_imports_file_id_idx" ON "code_imports" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "code_imports_workspace_specifier_idx" ON "code_imports" USING btree ("workspace_id","specifier");--> statement-breakpoint
CREATE UNIQUE INDEX "symbol_relationships_workspace_stable_key_unique" ON "symbol_relationships" USING btree ("workspace_id","stable_key");--> statement-breakpoint
CREATE INDEX "symbol_relationships_workspace_id_idx" ON "symbol_relationships" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "symbol_relationships_source_repository_id_idx" ON "symbol_relationships" USING btree ("source_repository_id");--> statement-breakpoint
CREATE INDEX "symbol_relationships_target_repository_id_idx" ON "symbol_relationships" USING btree ("target_repository_id");--> statement-breakpoint
CREATE INDEX "symbol_relationships_source_file_id_idx" ON "symbol_relationships" USING btree ("source_file_id");--> statement-breakpoint
CREATE INDEX "symbol_relationships_target_symbol_id_idx" ON "symbol_relationships" USING btree ("target_symbol_id");--> statement-breakpoint
ALTER TABLE "code_symbols" ADD CONSTRAINT "code_symbols_package_id_code_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."code_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_symbols_package_id_idx" ON "code_symbols" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "code_symbols_workspace_public_api_idx" ON "code_symbols" USING btree ("workspace_id","public_api");