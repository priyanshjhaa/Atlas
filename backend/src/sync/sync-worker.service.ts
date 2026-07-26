import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UnrecoverableError, Worker } from "bullmq";
import type { Job } from "bullmq";
import type { Environment } from "../config/environment";
import { GitHubAppService } from "../connectors/github-app.service";
import {
  IngestionCancelledError,
  IngestionService,
} from "../intelligence/ingestion.service";
import type { IngestionSummary } from "../intelligence/intelligence.types";
import { redisConnectionFromUrl } from "./redis-connection";
import { SyncJobsRepository } from "./sync-jobs.repository";
import {
  repositorySyncQueueName,
  type RepositorySyncJobData,
} from "./sync.types";

export interface SyncResult {
  outcome: "updated" | "no_change" | "cancelled";
  revision?: string;
  summary?: IngestionSummary;
}

@Injectable()
export class SyncWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(SyncWorkerService.name);
  private worker?: Worker<RepositorySyncJobData, SyncResult>;

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly jobs: SyncJobsRepository,
    private readonly github: GitHubAppService,
    private readonly ingestion: IngestionService,
  ) {}

  start(): void {
    if (this.worker) return;
    this.worker = new Worker<RepositorySyncJobData, SyncResult>(
      repositorySyncQueueName,
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
      this.logger.error(error, "Repository sync worker error");
    });
    this.logger.log("Repository synchronization worker started.");
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async processJob(
    job: Job<RepositorySyncJobData, SyncResult>,
  ): Promise<SyncResult> {
    const attempt = job.attemptsMade + 1;
    try {
      await this.jobs.markRunning(job.data.syncJobId, attempt);
      if (await this.cancelled(job.data.syncJobId)) {
        return { outcome: "cancelled" };
      }

      const context = await this.jobs.executionContext(job.data.syncJobId);
      if (!context) {
        throw new UnrecoverableError("Sync job context no longer exists.");
      }
      if (
        !context.isActive ||
        context.connectorStatus !== "active" ||
        !context.installationId
      ) {
        throw new UnrecoverableError(
          "The repository connector is not active.",
        );
      }
      if (!context.defaultBranch) {
        throw new UnrecoverableError(
          "The repository does not expose a default branch.",
        );
      }

      await this.progress(job, 25, "fetching_source_revision");
      const revision = await this.github.getRepositoryHead(
        context.installationId,
        context.owner,
        context.name,
        context.defaultBranch,
      );
      if (await this.cancelled(job.data.syncJobId)) {
        return { outcome: "cancelled" };
      }

      if (revision === context.lastSyncedRevision) {
        await this.jobs.complete(
          job.data.syncJobId,
          context.repositoryId,
          revision,
          "no_change",
        );
        await job.updateProgress(100);
        return { outcome: "no_change", revision };
      }

      const summary = await this.ingestion.ingest({
        workspaceId: context.workspaceId,
        repositoryId: context.repositoryId,
        repositoryName: context.name,
        owner: context.owner,
        installationId: context.installationId,
        revision,
        progress: (percent, stage) => this.progress(job, percent, stage),
        cancellationRequested: () =>
          this.jobs.cancellationRequested(job.data.syncJobId),
      });
      await this.jobs.complete(
        job.data.syncJobId,
        context.repositoryId,
        revision,
        "updated",
        { ...summary },
      );
      await job.updateProgress(100);
      return { outcome: "updated", revision, summary };
    } catch (error) {
      if (error instanceof IngestionCancelledError) {
        await this.jobs.markCancelled(job.data.syncJobId);
        return { outcome: "cancelled" };
      }
      const attempts = job.opts.attempts ?? 1;
      const retrying =
        !(error instanceof UnrecoverableError) && attempt < attempts;
      const message =
        error instanceof Error ? error.message : "Unknown synchronization error.";
      await this.jobs.markProcessingFailure(
        job.data.syncJobId,
        attempt,
        retrying,
        message,
      );
      throw error instanceof Error ? error : new Error(message);
    }
  }

  private async progress(
    job: Job<RepositorySyncJobData, SyncResult>,
    progress: number,
    stage: string,
  ): Promise<void> {
    await Promise.all([
      job.updateProgress(progress),
      this.jobs.updateProgress(job.data.syncJobId, progress, stage),
    ]);
  }

  private async cancelled(syncJobId: string): Promise<boolean> {
    if (!(await this.jobs.cancellationRequested(syncJobId))) return false;
    await this.jobs.markCancelled(syncJobId);
    return true;
  }
}
