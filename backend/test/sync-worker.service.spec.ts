import type { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import type { Environment } from "../src/config/environment";
import type { GitHubAppService } from "../src/connectors/github-app.service";
import type { SyncJobsRepository } from "../src/sync/sync-jobs.repository";
import type { RepositorySyncJobData } from "../src/sync/sync.types";
import {
  SyncWorkerService,
  type SyncResult,
} from "../src/sync/sync-worker.service";

function syncJob() {
  return {
    data: {
      syncJobId: "job-1",
      workspaceId: "workspace-1",
      repositoryId: "repository-1",
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
    updateProgress: vi.fn(async () => undefined),
  } as unknown as Job<RepositorySyncJobData, SyncResult>;
}

describe("SyncWorkerService", () => {
  it("short-circuits unchanged source revisions", async () => {
    const complete = vi.fn(async () => undefined);
    const jobs = {
      markRunning: vi.fn(async () => undefined),
      cancellationRequested: vi.fn(async () => false),
      executionContext: vi.fn(async () => ({
        repositoryId: "repository-1",
        owner: "atlas",
        name: "api",
        defaultBranch: "main",
        lastSyncedRevision: "sha-1",
        isActive: true,
        installationId: "42",
        connectorStatus: "active",
      })),
      updateProgress: vi.fn(async () => undefined),
      complete,
    } as unknown as SyncJobsRepository;
    const github = {
      getRepositoryHead: vi.fn(async () => "sha-1"),
    } as unknown as GitHubAppService;
    const worker = new SyncWorkerService(
      {} as ConfigService<Environment, true>,
      jobs,
      github,
    );

    await expect(worker.processJob(syncJob())).resolves.toEqual({
      outcome: "no_change",
      revision: "sha-1",
    });
    expect(complete).toHaveBeenCalledWith(
      "job-1",
      "repository-1",
      "sha-1",
      "no_change",
    );
  });

  it("honors a persisted cancellation before provider work begins", async () => {
    const markCancelled = vi.fn(async () => undefined);
    const getRepositoryHead = vi.fn();
    const jobs = {
      markRunning: vi.fn(async () => undefined),
      cancellationRequested: vi.fn(async () => true),
      markCancelled,
    } as unknown as SyncJobsRepository;
    const github = {
      getRepositoryHead,
    } as unknown as GitHubAppService;
    const worker = new SyncWorkerService(
      {} as ConfigService<Environment, true>,
      jobs,
      github,
    );

    await expect(worker.processJob(syncJob())).resolves.toEqual({
      outcome: "cancelled",
    });
    expect(getRepositoryHead).not.toHaveBeenCalled();
    expect(markCancelled).toHaveBeenCalledWith("job-1");
  });
});
