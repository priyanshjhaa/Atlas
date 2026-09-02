import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UnrecoverableError, Worker } from "bullmq";
import type { Job } from "bullmq";
import type { Environment } from "../config/environment";
import { ConnectorEncryptionService } from "../connectors/connector-encryption.service";
import {
  NotionApiRequestError,
  NotionApiService,
} from "../connectors/notion-api.service";
import { NotionConnectorsRepository } from "../connectors/notion-connectors.repository";
import { EmbeddingsService } from "../intelligence/embeddings.service";
import {
  notionContentHash,
  NotionDocumentChunkerService,
} from "./notion-document-chunker.service";
import { NotionSyncJobsRepository } from "./notion-sync-jobs.repository";
import { redisConnectionFromUrl } from "./redis-connection";
import {
  notionSyncQueueName,
  type NotionSyncJobData,
} from "./sync.types";

export interface NotionSyncResult {
  outcome: "updated" | "no_change";
  documentsUpdated: number;
  documentsSkipped: number;
  resourcesRemoved: number;
  versionsCreated: number;
  chunksCreated: number;
  truncatedDocuments: number;
}

@Injectable()
export class NotionSyncWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(NotionSyncWorkerService.name);
  private worker?: Worker<NotionSyncJobData, NotionSyncResult>;

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly jobs: NotionSyncJobsRepository,
    private readonly connectors: NotionConnectorsRepository,
    private readonly encryption: ConnectorEncryptionService,
    private readonly notion: NotionApiService,
    private readonly chunker: NotionDocumentChunkerService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  start(): void {
    if (this.worker) return;
    this.worker = new Worker<NotionSyncJobData, NotionSyncResult>(
      notionSyncQueueName,
      (job) => this.processJob(job),
      {
        connection: redisConnectionFromUrl(
          this.config.get("REDIS_URL", { infer: true }),
        ),
        concurrency: this.config.get("SYNC_WORKER_CONCURRENCY", {
          infer: true,
        }),
      },
    );
    this.worker.on("error", (error) => {
      this.logger.error(error, "Notion sync worker error");
    });
    this.logger.log("Notion synchronization worker started.");
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async processJob(
    job: Job<NotionSyncJobData, NotionSyncResult>,
  ): Promise<NotionSyncResult> {
    const attempt = job.attemptsMade + 1;
    try {
      await this.jobs.markRunning(job.data.notionSyncJobId, attempt);
      const context = await this.jobs.executionContext(
        job.data.notionSyncJobId,
      );
      if (
        !context ||
        context.connector.status !== "active" ||
        !context.connector.encryptedCredentials
      ) {
        throw new UnrecoverableError("The Notion connector is not active.");
      }
      const credentials = this.encryption.decrypt<{ accessToken: string }>(
        context.connector.encryptedCredentials,
      );
      if (!credentials.accessToken) {
        throw new UnrecoverableError("The Notion access token is unavailable.");
      }

      await this.progress(job, 15, "refreshing_notion_access");
      const resources = await this.notion.listAccessibleResources(
        credentials.accessToken,
      );
      await this.connectors.refreshResources(context.connector, resources);
      const selectedPages = await this.jobs.selectedPages(
        context.connector.id,
      );

      let documentsUpdated = 0;
      let documentsSkipped = 0;
      let resourcesRemoved = 0;
      let versionsCreated = 0;
      let chunksCreated = 0;
      let truncatedDocuments = 0;
      for (const [index, selected] of selectedPages.entries()) {
        const revision =
          selected.resource.lastEditedAt?.toISOString() ?? null;
        if (revision && revision === selected.sourceRevision) {
          documentsSkipped += 1;
          continue;
        }
        await this.progress(
          job,
          20 + Math.round((index / Math.max(selectedPages.length, 1)) * 70),
          "fetching_notion_content",
        );
        try {
          const lastEditor = await this.notion.resolveEditor(
            credentials.accessToken,
            selected.resource.lastEditor,
          );
          const resource = { ...selected.resource, lastEditor };
          const page = await this.notion.retrievePageMarkdown(
            credentials.accessToken,
            selected.resource.providerResourceId,
          );
          const contentHash = notionContentHash(page.markdown);
          const sourceRevision =
            selected.resource.lastEditedAt?.toISOString() ?? contentHash;
          const chunks = selected.contentHash === contentHash
            ? undefined
            : this.chunker.chunk(page.markdown, {
                resourceId: selected.resource.providerResourceId,
                title: selected.resource.title,
                url: selected.resource.url,
                sourceRevision,
                truncated: page.truncated,
              });
          const vectors = chunks
            ? await this.embeddings.embedTexts(
                chunks.map((chunk) =>
                  [
                    `Notion page: ${selected.resource.title}`,
                    typeof chunk.metadata.heading === "string"
                      ? `Section: ${chunk.metadata.heading}`
                      : "",
                    chunk.content,
                  ]
                    .filter(Boolean)
                    .join("\n"),
                ),
              )
            : [];
          if (chunks && vectors.length !== chunks.length) {
            throw new Error("Notion embedding count did not match chunk count.");
          }
          const persisted = await this.jobs.persistDocument(
            resource,
            page,
            chunks?.map((chunk, chunkIndex) => ({
              ...chunk,
              embedding: vectors[chunkIndex],
            })),
          );
          documentsUpdated += 1;
          versionsCreated += persisted.versionCreated ? 1 : 0;
          chunksCreated += persisted.chunksCreated;
          truncatedDocuments += page.truncated ? 1 : 0;
        } catch (error) {
          if (error instanceof NotionApiRequestError && error.status === 404) {
            await this.connectors.markResourceInactive(selected.resource.id);
            resourcesRemoved += 1;
            continue;
          }
          throw error;
        }
      }

      const result: NotionSyncResult = {
        outcome: documentsUpdated ? "updated" : "no_change",
        documentsUpdated,
        documentsSkipped,
        resourcesRemoved,
        versionsCreated,
        chunksCreated,
        truncatedDocuments,
      };
      await this.progress(job, 95, "persisting_notion_documents");
      await this.jobs.complete(job.data.notionSyncJobId, { ...result });
      await job.updateProgress(100);
      return result;
    } catch (error) {
      let processingError = error;
      const context = await this.jobs.executionContext(
        job.data.notionSyncJobId,
      );
      if (
        context &&
        error instanceof NotionApiRequestError &&
        [401, 403].includes(error.status)
      ) {
        await this.connectors.markAccessLost(
          context.connector,
          error.status === 401 ? "revoked" : "failed",
          error.message,
        );
        processingError = new UnrecoverableError(error.message);
      }
      const attempts = job.opts.attempts ?? 1;
      const retrying =
        !(processingError instanceof UnrecoverableError) && attempt < attempts;
      const message =
        processingError instanceof Error
          ? processingError.message
          : "Unknown Notion sync error.";
      await this.jobs.markFailure(
        job.data.notionSyncJobId,
        attempt,
        retrying,
        message,
      );
      throw processingError instanceof Error
        ? processingError
        : new Error(message);
    }
  }

  private async progress(
    job: Job<NotionSyncJobData, NotionSyncResult>,
    progress: number,
    stage: string,
  ) {
    await Promise.all([
      job.updateProgress(progress),
      this.jobs.updateProgress(job.data.notionSyncJobId, progress, stage),
    ]);
  }
}
