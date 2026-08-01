import type { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import type { Environment } from "../src/config/environment";
import type { ConnectorEncryptionService } from "../src/connectors/connector-encryption.service";
import {
  NotionApiRequestError,
  type NotionApiService,
} from "../src/connectors/notion-api.service";
import type { NotionConnectorsRepository } from "../src/connectors/notion-connectors.repository";
import type { NotionSyncJobsRepository } from "../src/sync/notion-sync-jobs.repository";
import {
  NotionSyncWorkerService,
  type NotionSyncResult,
} from "../src/sync/notion-sync-worker.service";
import type { NotionSyncJobData } from "../src/sync/sync.types";

function syncJob() {
  return {
    data: {
      notionSyncJobId: "job-1",
      workspaceId: "workspace-1",
      connectorId: "connector-1",
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
    updateProgress: vi.fn(async () => undefined),
  } as unknown as Job<NotionSyncJobData, NotionSyncResult>;
}

function context() {
  return {
    workspaceId: "workspace-1",
    connector: {
      id: "connector-1",
      workspaceId: "workspace-1",
      status: "active",
      encryptedCredentials: "encrypted",
    },
  };
}

function worker(
  jobs: object,
  connectors: object,
  notion: object,
) {
  return new NotionSyncWorkerService(
    {} as ConfigService<Environment, true>,
    jobs as unknown as NotionSyncJobsRepository,
    connectors as unknown as NotionConnectorsRepository,
    {
      decrypt: vi.fn(() => ({ accessToken: "access-token" })),
    } as unknown as ConnectorEncryptionService,
    notion as unknown as NotionApiService,
  );
}

describe("NotionSyncWorkerService", () => {
  it("skips selected pages whose Notion revision is already persisted", async () => {
    const complete = vi.fn(async () => undefined);
    const jobs = {
      markRunning: vi.fn(async () => undefined),
      executionContext: vi.fn(async () => context()),
      selectedPages: vi.fn(async () => [
        {
          resource: {
            lastEditedAt: new Date("2026-08-01T12:00:00.000Z"),
          },
          sourceRevision: "2026-08-01T12:00:00.000Z",
        },
      ]),
      updateProgress: vi.fn(async () => undefined),
      complete,
    };
    const retrievePageMarkdown = vi.fn();
    const result = await worker(
      jobs,
      { refreshResources: vi.fn(async () => undefined) },
      {
        listAccessibleResources: vi.fn(async () => []),
        retrievePageMarkdown,
      },
    ).processJob(syncJob());

    expect(result).toMatchObject({
      outcome: "no_change",
      documentsSkipped: 1,
      documentsUpdated: 0,
    });
    expect(retrievePageMarkdown).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
  });

  it("persists changed page content and records a bounded version", async () => {
    const persistDocument = vi.fn(async () => ({ versionCreated: true }));
    const resource = {
      id: "resource-1",
      providerResourceId: "page-1",
      lastEditedAt: new Date("2026-08-01T12:00:00.000Z"),
    };
    const result = await worker(
      {
        markRunning: vi.fn(async () => undefined),
        executionContext: vi.fn(async () => context()),
        selectedPages: vi.fn(async () => [
          { resource, sourceRevision: "old-revision" },
        ]),
        updateProgress: vi.fn(async () => undefined),
        persistDocument,
        complete: vi.fn(async () => undefined),
      },
      { refreshResources: vi.fn(async () => undefined) },
      {
        listAccessibleResources: vi.fn(async () => []),
        retrievePageMarkdown: vi.fn(async () => ({
          markdown: "# Current",
          truncated: false,
          unknownBlockIdsVisited: 0,
        })),
      },
    ).processJob(syncJob());

    expect(result).toMatchObject({
      outcome: "updated",
      documentsUpdated: 1,
      versionsCreated: 1,
    });
    expect(persistDocument).toHaveBeenCalledWith(
      resource,
      expect.objectContaining({ markdown: "# Current" }),
    );
  });

  it("revokes the connector without retrying when Notion rejects its token", async () => {
    const markAccessLost = vi.fn(async () => undefined);
    const markFailure = vi.fn(async () => undefined);
    const jobs = {
      markRunning: vi.fn(async () => undefined),
      executionContext: vi.fn(async () => context()),
      updateProgress: vi.fn(async () => undefined),
      markFailure,
    };
    await expect(
      worker(
        jobs,
        { markAccessLost },
        {
          listAccessibleResources: vi.fn(async () => {
            throw new NotionApiRequestError("Unauthorized", 401, "unauthorized");
          }),
        },
      ).processJob(syncJob()),
    ).rejects.toThrow("Unauthorized");

    expect(markAccessLost).toHaveBeenCalledWith(
      expect.objectContaining({ id: "connector-1" }),
      "revoked",
      "Unauthorized",
    );
    expect(markFailure).toHaveBeenCalledWith(
      "job-1",
      1,
      false,
      "Unauthorized",
    );
  });
});
