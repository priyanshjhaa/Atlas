import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedIdentity } from "../auth/auth.types";
import { SyncJobsRepository } from "./sync-jobs.repository";
import { SyncQueueService } from "./sync-queue.service";

@Injectable()
export class SyncJobsService {
  constructor(
    private readonly jobs: SyncJobsRepository,
    private readonly queue: SyncQueueService,
  ) {}

  list(workspaceId: string) {
    return this.jobs.list(workspaceId);
  }

  async enqueue(
    workspaceId: string,
    repositoryIds: string[] | undefined,
    idempotencyKey: string | undefined,
    identity: AuthenticatedIdentity,
  ) {
    const repositories = await this.jobs.listActiveRepositories(
      workspaceId,
      repositoryIds,
    );
    if (repositoryIds?.length && repositories.length !== repositoryIds.length) {
      throw new NotFoundException(
        "One or more active repositories were not found.",
      );
    }

    const requestKey = idempotencyKey?.trim() || crypto.randomUUID();
    const results = [];
    for (const repository of repositories) {
      const result = await this.jobs.createQueued(
        workspaceId,
        repository.id,
        identity.user.id,
        `${requestKey}-${repository.id}`,
      );
      if (result.created) {
        try {
          await this.queue.enqueue({
            syncJobId: result.job.id,
            workspaceId,
            repositoryId: repository.id,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Queue unavailable.";
          await this.jobs.markQueueFailure(result.job.id, message);
          throw error;
        }
      }
      results.push({ ...result.job, deduplicated: !result.created });
    }
    return results;
  }

  async cancel(
    workspaceId: string,
    syncJobId: string,
    identity: AuthenticatedIdentity,
  ) {
    const jobRecord = await this.jobs.find(workspaceId, syncJobId);
    if (!jobRecord) throw new NotFoundException("Sync job not found.");
    if (!["queued", "running"].includes(jobRecord.status)) {
      throw new ConflictException("Only queued or running jobs can be cancelled.");
    }

    const requested = await this.jobs.requestCancellation(
      workspaceId,
      syncJobId,
    );
    if (!requested) {
      throw new ConflictException("The sync job is no longer cancellable.");
    }

    const queuedJob = await this.queue.getJob(syncJobId);
    const state = await queuedJob?.getState();
    if (!queuedJob || state !== "active") {
      await queuedJob?.remove();
      await this.jobs.markCancelled(syncJobId, identity.user.id);
      return { id: syncJobId, status: "cancelled" as const };
    }

    return { id: syncJobId, status: "cancellation_requested" as const };
  }

  async retry(workspaceId: string, syncJobId: string) {
    const jobRecord = await this.jobs.find(workspaceId, syncJobId);
    if (!jobRecord) throw new NotFoundException("Sync job not found.");
    if (jobRecord.status !== "failed") {
      throw new ConflictException("Only failed sync jobs can be retried.");
    }

    const queuedJob = await this.queue.getJob(syncJobId);
    if (!queuedJob) {
      throw new ConflictException(
        "The queue record has expired; start a new synchronization instead.",
      );
    }
    await this.jobs.prepareRetry(syncJobId);
    try {
      await queuedJob.retry("failed", {
        resetAttemptsMade: true,
        resetAttemptsStarted: true,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Queue retry failed.";
      await this.jobs.markProcessingFailure(
        syncJobId,
        jobRecord.attempt,
        false,
        message,
      );
      throw error;
    }
    return { id: syncJobId, status: "queued" as const };
  }
}
