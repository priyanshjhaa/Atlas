CREATE TABLE "notion_document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"connector_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"token_count" integer NOT NULL,
	"source_revision" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notion_document_chunks" ADD CONSTRAINT "notion_document_chunks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_document_chunks" ADD CONSTRAINT "notion_document_chunks_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_document_chunks" ADD CONSTRAINT "notion_document_chunks_resource_id_notion_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."notion_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_document_chunks" ADD CONSTRAINT "notion_document_chunks_document_id_notion_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."notion_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notion_document_chunks_document_chunk_unique" ON "notion_document_chunks" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "notion_document_chunks_workspace_id_idx" ON "notion_document_chunks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "notion_document_chunks_connector_id_idx" ON "notion_document_chunks" USING btree ("connector_id");--> statement-breakpoint
CREATE INDEX "notion_document_chunks_resource_id_idx" ON "notion_document_chunks" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "notion_document_chunks_document_id_idx" ON "notion_document_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "notion_document_chunks_embedding_hnsw_idx" ON "notion_document_chunks" USING hnsw ("embedding" vector_cosine_ops);