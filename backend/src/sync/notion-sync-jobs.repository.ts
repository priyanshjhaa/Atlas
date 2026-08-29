import { Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import {
  auditEvents,
  connectors,
  notionDocumentChunks,
  notionDocuments,
  notionDocumentVersions,
  notionResources,
  notionSyncJobs,
} from "../database/schema";
import type { NotionPageContent } from "../connectors/notion-api.service";
import {
  notionContentHash,
  type NotionDocumentChunk,
} from "./notion-document-chunker.service";

const activeStatuses = ["queued", "running"] as const;
const MAX_DOCUMENT_VERSIONS = 50;

export interface EmbeddedNotionDocumentChunk extends NotionDocumentChunk {
  embedding: number[];
}

@Injectable()
export class NotionSyncJobsRepository {
  constructor(private readonly database: DatabaseService) {}

  list(workspaceId: string) {
    return this.database.client
      .select({
        id: notionSyncJobs.id,
        connectorId: notionSyncJobs.connectorId,
        configuration: connectors.configuration,
        status: notionSyncJobs.status,
        attempt: notionSyncJobs.attempt,
        progress: notionSyncJobs.progress,
        stage: notionSyncJobs.stage,
        result: notionSyncJobs.result,
        errorCode: notionSyncJobs.errorCode,
        errorMessage: notionSyncJobs.errorMessage,
        startedAt: notionSyncJobs.startedAt,
        completedAt: notionSyncJobs.completedAt,
        createdAt: notionSyncJobs.createdAt,
        updatedAt: notionSyncJobs.updatedAt,
      })
      .from(notionSyncJobs)
      .innerJoin(connectors, eq(connectors.id, notionSyncJobs.connectorId))
      .where(eq(notionSyncJobs.workspaceId, workspaceId))
      .orderBy(desc(notionSyncJobs.createdAt))
      .limit(100);
  }

  async createQueued(
    workspaceId: string,
    connectorId: string,
    requestedByUserId: string,
    idempotencyKey: string,
  ) {
    return this.database.client.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(notionSyncJobs)
        .where(
          and(
            eq(notionSyncJobs.workspaceId, workspaceId),
            or(
              eq(notionSyncJobs.idempotencyKey, idempotencyKey),
              and(
                eq(notionSyncJobs.connectorId, connectorId),
                inArray(notionSyncJobs.status, [...activeStatuses]),
              ),
            ),
          ),
        )
        .limit(1);
      if (existing) return { job: existing, created: false };

      const [created] = await transaction
        .insert(notionSyncJobs)
        .values({
          workspaceId,
          connectorId,
          requestedByUserId,
          idempotencyKey,
        })
        .onConflictDoNothing()
        .returning();
      if (!created) {
        const [concurrent] = await transaction
          .select()
          .from(notionSyncJobs)
          .where(
            and(
              eq(notionSyncJobs.workspaceId, workspaceId),
              eq(notionSyncJobs.connectorId, connectorId),
              inArray(notionSyncJobs.status, [...activeStatuses]),
            ),
          )
          .limit(1);
        if (!concurrent) throw new Error("Concurrent Notion sync job was lost.");
        return { job: concurrent, created: false };
      }

      await transaction.insert(auditEvents).values({
        workspaceId,
        actorUserId: requestedByUserId,
        action: "notion.sync.queued",
        targetType: "notion_sync_job",
        targetId: created.id,
        metadata: { connectorId },
      });
      return { job: created, created: true };
    });
  }

  async executionContext(jobId: string) {
    const [context] = await this.database.client
      .select({
        jobId: notionSyncJobs.id,
        workspaceId: notionSyncJobs.workspaceId,
        connector: connectors,
      })
      .from(notionSyncJobs)
      .innerJoin(connectors, eq(connectors.id, notionSyncJobs.connectorId))
      .where(eq(notionSyncJobs.id, jobId))
      .limit(1);
    return context ?? null;
  }

  selectedPages(connectorId: string) {
    return this.database.client
      .select({
        resource: notionResources,
        sourceRevision: notionDocuments.sourceRevision,
        contentHash: notionDocuments.contentHash,
      })
      .from(notionResources)
      .leftJoin(
        notionDocuments,
        eq(notionDocuments.resourceId, notionResources.id),
      )
      .where(
        and(
          eq(notionResources.connectorId, connectorId),
          eq(notionResources.kind, "page"),
          eq(notionResources.isSelected, true),
          eq(notionResources.isActive, true),
        ),
      );
  }

  async persistDocument(
    resource: typeof notionResources.$inferSelect,
    page: NotionPageContent,
    embeddedChunks?: EmbeddedNotionDocumentChunk[],
  ): Promise<{ versionCreated: boolean; chunksCreated: number }> {
    const contentHash = notionContentHash(page.markdown);
    const sourceRevision =
      resource.lastEditedAt?.toISOString() ?? contentHash;
    const citation = {
      provider: "notion",
      resourceId: resource.providerResourceId,
      title: resource.title,
      url: resource.url,
      lastEditedAt: resource.lastEditedAt?.toISOString() ?? null,
    };

    return this.database.client.transaction(async (transaction) => {
      const [document] = await transaction
        .insert(notionDocuments)
        .values({
          workspaceId: resource.workspaceId,
          connectorId: resource.connectorId,
          resourceId: resource.id,
          title: resource.title,
          content: page.markdown,
          contentHash,
          sourceRevision,
          lastEditor: resource.lastEditor,
          citation,
          truncated: page.truncated,
        })
        .onConflictDoUpdate({
          target: notionDocuments.resourceId,
          set: {
            title: resource.title,
            content: page.markdown,
            contentHash,
            sourceRevision,
            lastEditor: resource.lastEditor,
            citation,
            truncated: page.truncated,
            syncedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning();

      const [version] = await transaction
        .insert(notionDocumentVersions)
        .values({
          workspaceId: resource.workspaceId,
          documentId: document.id,
          contentHash,
          sourceRevision,
          editor: resource.lastEditor,
          content: page.markdown,
          citation,
          truncated: page.truncated,
        })
        .onConflictDoNothing()
        .returning({ id: notionDocumentVersions.id });

      const staleVersions = await transaction
        .select({ id: notionDocumentVersions.id })
        .from(notionDocumentVersions)
        .where(eq(notionDocumentVersions.documentId, document.id))
        .orderBy(desc(notionDocumentVersions.capturedAt))
        .offset(MAX_DOCUMENT_VERSIONS);
      if (staleVersions.length) {
        await transaction
          .delete(notionDocumentVersions)
          .where(
            inArray(
              notionDocumentVersions.id,
              staleVersions.map((item) => item.id),
            ),
          );
      }

      if (embeddedChunks) {
        await transaction
          .delete(notionDocumentChunks)
          .where(eq(notionDocumentChunks.documentId, document.id));
        if (embeddedChunks.length) {
          await transaction.insert(notionDocumentChunks).values(
            embeddedChunks.map((chunk) => ({
              workspaceId: resource.workspaceId,
              connectorId: resource.connectorId,
              resourceId: resource.id,
              documentId: document.id,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              tokenCount: chunk.tokenCount,
              sourceRevision,
              metadata: chunk.metadata,
              embedding: chunk.embedding,
            })),
          );
        }
      } else {
        await transaction
          .update(notionDocumentChunks)
          .set({ sourceRevision, updatedAt: new Date() })
          .where(eq(notionDocumentChunks.documentId, document.id));
      }
      await transaction
        .update(notionResources)
        .set({
          lastEditor: resource.lastEditor,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(notionResources.id, resource.id));
      return {
        versionCreated: Boolean(version),
        chunksCreated: embeddedChunks?.length ?? 0,
      };
    });
  }

  async markRunning(jobId: string, attempt: number) {
    await this.database.client
      .update(notionSyncJobs)
      .set({
        status: "running",
        attempt,
        stage: "starting",
        progress: 5,
        startedAt: new Date(),
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(notionSyncJobs.id, jobId));
  }

  async updateProgress(jobId: string, progress: number, stage: string) {
    await this.database.client
      .update(notionSyncJobs)
      .set({ progress, stage, updatedAt: new Date() })
      .where(eq(notionSyncJobs.id, jobId));
  }

  async complete(jobId: string, result: Record<string, unknown>) {
    await this.database.client.transaction(async (transaction) => {
      const now = new Date();
      const [job] = await transaction
        .update(notionSyncJobs)
        .set({
          status: "completed",
          progress: 100,
          stage: result.outcome === "no_change" ? "no_change" : "updated",
          result,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(notionSyncJobs.id, jobId))
        .returning({
          workspaceId: notionSyncJobs.workspaceId,
          connectorId: notionSyncJobs.connectorId,
        });
      if (job) {
        await transaction.insert(auditEvents).values({
          workspaceId: job.workspaceId,
          action: "notion.sync.completed",
          targetType: "notion_sync_job",
          targetId: jobId,
          metadata: { connectorId: job.connectorId, ...result },
        });
      }
    });
  }

  async markFailure(
    jobId: string,
    attempt: number,
    retrying: boolean,
    message: string,
  ) {
    await this.database.client
      .update(notionSyncJobs)
      .set({
        status: retrying ? "queued" : "failed",
        attempt,
        stage: retrying ? "retry_scheduled" : "failed",
        errorCode: "notion_sync_failed",
        errorMessage: message.slice(0, 1_000),
        completedAt: retrying ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(notionSyncJobs.id, jobId));
  }
}
