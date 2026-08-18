import type { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Environment } from "../src/config/environment";
import type { ConnectorEncryptionService } from "../src/connectors/connector-encryption.service";
import {
  NotionApiRequestError,
  type NotionApiService,
} from "../src/connectors/notion-api.service";
import type { NotionConnectorsRepository } from "../src/connectors/notion-connectors.repository";
import type { EmbeddingsService } from "../src/intelligence/embeddings.service";
import type { NotionDocumentChunkerService } from "../src/sync/notion-document-chunker.service";
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
  chunker: object = {
    chunk: vi.fn(() => [
      {
        chunkIndex: 0,
        content: "# Current",
        tokenCount: 3,
        metadata: { heading: "Current" },
      },
    ]),
  },
  embeddings: object = {
    embedTexts: vi.fn(async (inputs: string[]) =>
      inputs.map(() => new Array<number>(1536).fill(0)),
    ),
  },
) {
  return new NotionSyncWorkerService(
    {} as ConfigService<Environment, true>,
    jobs as unknown as NotionSyncJobsRepository,
    connectors as unknown as NotionConnectorsRepository,
    {
      decrypt: vi.fn(() => ({ accessToken: "access-token" })),
    } as unknown as ConnectorEncryptionService,
    notion as unknown as NotionApiService,
    chunker as unknown as NotionDocumentChunkerService,
    embeddings as unknown as EmbeddingsService,
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
    const resource = {
      id: "resource-1",
      providerResourceId: "page-1",
      title: "Current",
      url: "https://notion.so/page-1",
      lastEditedAt: new Date("2026-08-01T12:00:00.000Z"),
    };
    const persistDocument = vi.fn(
      async (
        resourceInput: typeof resource,
        pageInput: { markdown: string; truncated: boolean },
        chunksInput?: Array<{
          chunkIndex: number;
          content: string;
          embedding: number[];
        }>,
      ) => ({
        versionCreated: Boolean(resourceInput && pageInput),
        chunksCreated: chunksInput?.length ?? 0,
      }),
    );
    const result = await worker(
      {
        markRunning: vi.fn(async () => undefined),
        executionContext: vi.fn(async () => context()),
        selectedPages: vi.fn(async () => [
          {
            resource,
            sourceRevision: "old-revision",
            contentHash: "old-hash",
          },
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
      chunksCreated: 1,
    });
    expect(persistDocument).toHaveBeenCalledOnce();
    const [persistedResource, persistedPage, persistedChunks] =
      persistDocument.mock.calls[0] ?? [];
    expect(persistedResource).toBe(resource);
    expect(persistedPage).toMatchObject({ markdown: "# Current" });
    expect(persistedChunks).toHaveLength(1);
    expect(persistedChunks?.[0]).toMatchObject({
      chunkIndex: 0,
      content: "# Current",
    });
    expect(persistedChunks?.[0]?.embedding).toHaveLength(1536);
  });

  it("does not rebuild chunks when only the Notion revision changes", async () => {
    const markdown = "# Current";
    const contentHash = createHash("sha256").update(markdown).digest("hex");
    const persistDocument = vi.fn(async () => ({
      versionCreated: false,
      chunksCreated: 0,
    }));
    const chunk = vi.fn();
    const embedTexts = vi.fn();

    const result = await worker(
      {
        markRunning: vi.fn(async () => undefined),
        executionContext: vi.fn(async () => context()),
        selectedPages: vi.fn(async () => [
          {
            resource: {
              id: "resource-1",
              providerResourceId: "page-1",
              title: "Current",
              url: null,
              lastEditedAt: new Date("2026-08-02T12:00:00.000Z"),
            },
            sourceRevision: "old-revision",
            contentHash,
          },
        ]),
        updateProgress: vi.fn(async () => undefined),
        persistDocument,
        complete: vi.fn(async () => undefined),
      },
      { refreshResources: vi.fn(async () => undefined) },
      {
        listAccessibleResources: vi.fn(async () => []),
        retrievePageMarkdown: vi.fn(async () => ({
          markdown,
          truncated: false,
          unknownBlockIdsVisited: 0,
        })),
      },
      { chunk },
      { embedTexts },
    ).processJob(syncJob());

    expect(result).toMatchObject({ chunksCreated: 0, documentsUpdated: 1 });
    expect(chunk).not.toHaveBeenCalled();
    expect(embedTexts).not.toHaveBeenCalled();
    expect(persistDocument).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      undefined,
    );
  });

  it("fails the sync before persistence when embeddings cannot be generated", async () => {
    const persistDocument = vi.fn();
    const markFailure = vi.fn(async () => undefined);

    await expect(
      worker(
        {
          markRunning: vi.fn(async () => undefined),
          executionContext: vi.fn(async () => context()),
          selectedPages: vi.fn(async () => [
            {
              resource: {
                id: "resource-1",
                providerResourceId: "page-1",
                title: "Current",
                url: null,
                lastEditedAt: new Date("2026-08-02T12:00:00.000Z"),
              },
              sourceRevision: "old-revision",
              contentHash: "old-hash",
            },
          ]),
          updateProgress: vi.fn(async () => undefined),
          persistDocument,
          markFailure,
        },
        { refreshResources: vi.fn(async () => undefined) },
        {
          listAccessibleResources: vi.fn(async () => []),
          retrievePageMarkdown: vi.fn(async () => ({
            markdown: "# Changed",
            truncated: false,
            unknownBlockIdsVisited: 0,
          })),
        },
        undefined,
        {
          embedTexts: vi.fn(async () => {
            throw new Error("embedding provider unavailable");
          }),
        },
      ).processJob(syncJob()),
    ).rejects.toThrow("embedding provider unavailable");

    expect(persistDocument).not.toHaveBeenCalled();
    expect(markFailure).toHaveBeenCalledWith(
      "job-1",
      1,
      true,
      "embedding provider unavailable",
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
