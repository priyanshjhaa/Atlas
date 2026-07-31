CREATE TABLE "code_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"source_symbol_id" uuid,
	"stable_key" text NOT NULL,
	"local_name" text NOT NULL,
	"member_name" text,
	"line" integer NOT NULL,
	"source_revision" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "symbol_relationships" ADD COLUMN "source_symbol_id" uuid;--> statement-breakpoint
ALTER TABLE "code_calls" ADD CONSTRAINT "code_calls_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_calls" ADD CONSTRAINT "code_calls_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_calls" ADD CONSTRAINT "code_calls_file_id_code_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."code_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_calls" ADD CONSTRAINT "code_calls_source_symbol_id_code_symbols_id_fk" FOREIGN KEY ("source_symbol_id") REFERENCES "public"."code_symbols"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "code_calls_repository_stable_key_unique" ON "code_calls" USING btree ("repository_id","stable_key");--> statement-breakpoint
CREATE INDEX "code_calls_workspace_id_idx" ON "code_calls" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "code_calls_repository_id_idx" ON "code_calls" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "code_calls_file_id_idx" ON "code_calls" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "code_calls_source_symbol_id_idx" ON "code_calls" USING btree ("source_symbol_id");--> statement-breakpoint
ALTER TABLE "symbol_relationships" ADD CONSTRAINT "symbol_relationships_source_symbol_id_code_symbols_id_fk" FOREIGN KEY ("source_symbol_id") REFERENCES "public"."code_symbols"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "symbol_relationships_source_symbol_id_idx" ON "symbol_relationships" USING btree ("source_symbol_id");