import { Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import {
  auditEvents,
  connectors,
  repositories,
  syncJobs,
} from "../database/schema";

const activeStatuses = ["queued", "running"] as const;

@Injectable()
export class SyncJobsRepository {
  constructor(private readonly database: DatabaseService) {}

  list(workspaceId: string) {
    return this.database.client
      .select({
        id: syncJobs.id,
        repositoryId: syncJobs.repositoryId,
        repositoryOwner: repositories.owner,
        repositoryName: repositories.name,
        status: syncJobs.status,
        attempt: syncJobs.attempt,
        progress: syncJobs.progress,
        stage: syncJobs.stage,
        result: syncJobs.result,
        errorCode: syncJobs.errorCode,
        errorMessage: syncJobs.errorMessage,
        cancelRequestedAt: syncJobs.cancelRequestedAt,
        startedAt: syncJobs.startedAt,
        completedAt: syncJobs.completedAt,
        createdAt: syncJobs.createdAt,
        updatedAt: syncJobs.updatedAt,
      })
      .from(syncJobs)
      .innerJoin(repositories, eq(repositories.id, syncJobs.repositoryId))
      .where(eq(syncJobs.workspaceId, workspaceId))
      .orderBy(desc(syncJobs.createdAt))
      .limit(100);
  }

  async createQueued(
    workspaceId: string,
    repositoryId: string,
    requestedByUserId: string,
    idempotencyKey: string,
  ) {
    return this.database.client.transaction(async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(syncJobs)
        .where(
          and(
            eq(syncJobs.workspaceId, workspaceId),
            or(
              eq(syncJobs.idempotencyKey, idempotencyKey),
              and(
                eq(syncJobs.repositoryId, repositoryId),
                inArray(syncJobs.status, [...activeStatuses]),
              ),
            ),
          ),
        )
        .limit(1);
      if (existing) return { job: existing, created: false };

      const [created] = await transaction
        .insert(syncJobs)
        .values({
          workspaceId,
          repositoryId,
          requestedByUserId,
          idempotencyKey,
        })
        .onConflictDoNothing()
        .returning();

      if (!created) {
        const [concurrent] = await transaction
          .select()
          .from(syncJobs)
          .where(
            and(
              eq(syncJobs.workspaceId, workspaceId),
              or(
                eq(syncJobs.idempotencyKey, idempotencyKey),
                and(
                  eq(syncJobs.repositoryId, repositoryId),
                  inArray(syncJobs.status, [...activeStatuses]),
                ),
              ),
            ),
          )
          .limit(1);
        if (!concurrent) {
          throw new Error("Concurrent sync job could not be loaded.");
        }
        return { job: concurrent, created: false };
      }

      await transaction.insert(auditEvents).values({
        workspaceId,
        actorUserId: requestedByUserId,
        action: "repository.sync.queued",
        targetType: "sync_job",
        targetId: created.id,
        metadata: { repositoryId },
      });
      return { job: created, created: true };
    });
  }

  async find(workspaceId: string, syncJobId: string) {
    const [job] = await this.database.client
      .select()
      .from(syncJobs)
      .where(
        and(
          eq(syncJobs.workspaceId, workspaceId),
          eq(syncJobs.id, syncJobId),
        ),
      )
      .limit(1);
    return job ?? null;
  }

  async listActiveRepositories(
    workspaceId: string,
    repositoryIds?: string[],
  ) {
    return this.database.client
      .select({ id: repositories.id })
      .from(repositories)
      .where(
        and(
          eq(repositories.workspaceId, workspaceId),
          eq(repositories.isActive, true),
          repositoryIds?.length
            ? inArray(repositories.id, repositoryIds)
            : undefined,
        ),
      );
  }

  async markQueueFailure(syncJobId: string, message: string): Promise<void> {
    await this.database.client
      .update(syncJobs)
      .set({
        status: "failed",
        errorCode: "queue_unavailable",
        errorMessage: message,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(syncJobs.id, syncJobId));
  }

  async requestCancellation(
    workspaceId: string,
    syncJobId: string,
  ): Promise<boolean> {
    const rows = await this.database.client
      .update(syncJobs)
      .set({ cancelRequestedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(syncJobs.workspaceId, workspaceId),
          eq(syncJobs.id, syncJobId),
          inArray(syncJobs.status, [...activeStatuses]),
        ),
      )
      .returning({ id: syncJobs.id });
    return rows.length === 1;
  }

  async markCancelled(
    syncJobId: string,
    actorUserId?: string,
  ): Promise<void> {
    await this.database.client.transaction(async (transaction) => {
      const [job] = await transaction
        .update(syncJobs)
        .set({
          status: "cancelled",
          stage: "cancelled",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(syncJobs.id, syncJobId))
        .returning({ workspaceId: syncJobs.workspaceId });
      if (job) {
        await transaction.insert(auditEvents).values({
          workspaceId: job.workspaceId,
          actorUserId,
          action: "repository.sync.cancelled",
          targetType: "sync_job",
          targetId: syncJobId,
        });
      }
    });
  }

  async prepareRetry(syncJobId: string): Promise<void> {
    await this.database.client
      .update(syncJobs)
      .set({
        status: "queued",
        attempt: 0,
        progress: 0,
        stage: "queued",
        result: null,
        errorCode: null,
        errorMessage: null,
        cancelRequestedAt: null,
        startedAt: null,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(syncJobs.id, syncJobId));
  }

  async executionContext(syncJobId: string) {
    const [context] = await this.database.client
      .select({
        syncJobId: syncJobs.id,
        workspaceId: syncJobs.workspaceId,
        repositoryId: repositories.id,
        owner: repositories.owner,
        name: repositories.name,
        defaultBranch: repositories.defaultBranch,
        lastSyncedRevision: repositories.lastSyncedRevision,
        isActive: repositories.isActive,
        installationId: connectors.providerInstallationId,
        connectorStatus: connectors.status,
        cancelRequestedAt: syncJobs.cancelRequestedAt,
      })
      .from(syncJobs)
      .innerJoin(repositories, eq(repositories.id, syncJobs.repositoryId))
      .leftJoin(connectors, eq(connectors.id, repositories.connectorId))
      .where(eq(syncJobs.id, syncJobId))
      .limit(1);
    return context ?? null;
  }

  async markRunning(syncJobId: string, attempt: number): Promise<void> {
    await this.database.client
      .update(syncJobs)
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
      .where(eq(syncJobs.id, syncJobId));
  }

  async updateProgress(
    syncJobId: string,
    progress: number,
    stage: string,
  ): Promise<void> {
    await this.database.client
      .update(syncJobs)
      .set({ progress, stage, updatedAt: new Date() })
      .where(eq(syncJobs.id, syncJobId));
  }

  async cancellationRequested(syncJobId: string): Promise<boolean> {
    const [job] = await this.database.client
      .select({ cancelRequestedAt: syncJobs.cancelRequestedAt })
      .from(syncJobs)
      .where(eq(syncJobs.id, syncJobId))
      .limit(1);
    return Boolean(job?.cancelRequestedAt);
  }

  async complete(
    syncJobId: string,
    repositoryId: string,
    revision: string,
    outcome: "updated" | "no_change",
  ): Promise<void> {
    await this.database.client.transaction(async (transaction) => {
      const now = new Date();
      await transaction
        .update(repositories)
        .set({
          lastSyncedAt: now,
          lastSyncedRevision: revision,
          updatedAt: now,
        })
        .where(eq(repositories.id, repositoryId));
      const [job] = await transaction
        .update(syncJobs)
        .set({
          status: "completed",
          progress: 100,
          stage: outcome,
          result: { outcome, revision },
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(syncJobs.id, syncJobId))
        .returning({ workspaceId: syncJobs.workspaceId });
      if (job) {
        await transaction.insert(auditEvents).values({
          workspaceId: job.workspaceId,
          action: "repository.sync.completed",
          targetType: "sync_job",
          targetId: syncJobId,
          metadata: { repositoryId, outcome, revision },
        });
      }
    });
  }

  async markProcessingFailure(
    syncJobId: string,
    attempt: number,
    retrying: boolean,
    message: string,
  ): Promise<void> {
    await this.database.client
      .update(syncJobs)
      .set({
        status: retrying ? "queued" : "failed",
        attempt,
        stage: retrying ? "retry_scheduled" : "failed",
        errorCode: "sync_failed",
        errorMessage: message.slice(0, 1_000),
        completedAt: retrying ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(syncJobs.id, syncJobId));
  }
}
