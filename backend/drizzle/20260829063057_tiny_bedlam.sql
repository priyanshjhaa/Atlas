DROP INDEX "notion_document_versions_document_hash_unique";--> statement-breakpoint
ALTER TABLE "notion_document_versions" ADD COLUMN "editor" jsonb;--> statement-breakpoint
ALTER TABLE "notion_documents" ADD COLUMN "last_editor" jsonb;--> statement-breakpoint
ALTER TABLE "notion_resources" ADD COLUMN "last_editor" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "notion_document_versions_document_revision_unique" ON "notion_document_versions" USING btree ("document_id","source_revision");