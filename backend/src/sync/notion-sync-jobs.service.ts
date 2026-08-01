import { Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedIdentity } from "../auth/auth.types";
import { NotionConnectorsRepository } from "../connectors/notion-connectors.repository";
import { NotionSyncJobsRepository } from "./notion-sync-jobs.repository";
import { NotionSyncQueueService } from "./notion-sync-queue.service";

@Injectable()
export class NotionSyncJobsService {
  constructor(
    private readonly jobs: NotionSyncJobsRepository,
    private readonly connectors: NotionConnectorsRepository,
    private readonly queue: NotionSyncQueueService,
  ) {}

  list(workspaceId: string) {
    return this.jobs.list(workspaceId);
  }

  async enqueue(
    workspaceId: string,
    idempotencyKey: string | undefined,
    identity: AuthenticatedIdentity,
  ) {
    const connector = await this.connectors.findActive(workspaceId);
    if (!connector) {
      throw new NotFoundException("Active Notion connector not found.");
    }
    const result = await this.jobs.createQueued(
      workspaceId,
      connector.id,
      identity.user.id,
      idempotencyKey?.trim() || crypto.randomUUID(),
    );
    if (result.created) {
      try {
        await this.queue.enqueue({
          notionSyncJobId: result.job.id,
          workspaceId,
          connectorId: connector.id,
        });
      } catch (error) {
        await this.jobs.markFailure(
          result.job.id,
          0,
          false,
          error instanceof Error ? error.message : "Queue unavailable.",
        );
        throw error;
      }
    }
    return [{ ...result.job, deduplicated: !result.created }];
  }
}
