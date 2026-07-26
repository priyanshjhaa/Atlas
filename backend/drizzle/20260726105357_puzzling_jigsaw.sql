CREATE TABLE "architecture_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"source_revision" text NOT NULL,
	"summary" text NOT NULL,
	"module_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"diagram" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"language" text NOT NULL,
	"token_count" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(1536)
);
--> statement-breakpoint
CREATE TABLE "code_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"path" text NOT NULL,
	"language" text NOT NULL,
	"checksum" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"source_revision" text NOT NULL,
	"parsed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"source_file_id" uuid NOT NULL,
	"target_file_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"stable_key" text NOT NULL,
	"provenance" text NOT NULL,
	"confidence" real NOT NULL,
	"source_revision" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_symbols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"stable_key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"line_start" integer NOT NULL,
	"line_end" integer NOT NULL,
	"exported" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "architecture_snapshots" ADD CONSTRAINT "architecture_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architecture_snapshots" ADD CONSTRAINT "architecture_snapshots_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_chunks" ADD CONSTRAINT "code_chunks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_chunks" ADD CONSTRAINT "code_chunks_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_chunks" ADD CONSTRAINT "code_chunks_file_id_code_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_files" ADD CONSTRAINT "code_files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_files" ADD CONSTRAINT "code_files_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_relationships" ADD CONSTRAINT "code_relationships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_relationships" ADD CONSTRAINT "code_relationships_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_relationships" ADD CONSTRAINT "code_relationships_source_file_id_code_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_relationships" ADD CONSTRAINT "code_relationships_target_file_id_code_files_id_fk" FOREIGN KEY ("target_file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_symbols" ADD CONSTRAINT "code_symbols_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_symbols" ADD CONSTRAINT "code_symbols_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_symbols" ADD CONSTRAINT "code_symbols_file_id_code_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "architecture_snapshots_repository_revision_unique" ON "architecture_snapshots" USING btree ("repository_id","source_revision");--> statement-breakpoint
CREATE INDEX "architecture_snapshots_workspace_id_idx" ON "architecture_snapshots" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "architecture_snapshots_repository_id_idx" ON "architecture_snapshots" USING btree ("repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX "code_chunks_file_chunk_unique" ON "code_chunks" USING btree ("file_id","chunk_index");--> statement-breakpoint
CREATE INDEX "code_chunks_workspace_id_idx" ON "code_chunks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "code_chunks_repository_id_idx" ON "code_chunks" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "code_chunks_file_id_idx" ON "code_chunks" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "code_chunks_embedding_hnsw_idx" ON "code_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "code_files_repository_path_unique" ON "code_files" USING btree ("repository_id","path");--> statement-breakpoint
CREATE INDEX "code_files_workspace_id_idx" ON "code_files" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "code_files_repository_id_idx" ON "code_files" USING btree ("repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX "code_relationships_repository_stable_key_unique" ON "code_relationships" USING btree ("repository_id","stable_key");--> statement-breakpoint
CREATE INDEX "code_relationships_workspace_id_idx" ON "code_relationships" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "code_relationships_repository_id_idx" ON "code_relationships" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "code_relationships_source_file_id_idx" ON "code_relationships" USING btree ("source_file_id");--> statement-breakpoint
CREATE INDEX "code_relationships_target_file_id_idx" ON "code_relationships" USING btree ("target_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "code_symbols_repository_stable_key_unique" ON "code_symbols" USING btree ("repository_id","stable_key");--> statement-breakpoint
CREATE INDEX "code_symbols_workspace_id_idx" ON "code_symbols" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "code_symbols_repository_id_idx" ON "code_symbols" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "code_symbols_file_id_idx" ON "code_symbols" USING btree ("file_id");