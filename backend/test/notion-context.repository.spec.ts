import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../src/database/database.service";
import { NotionContextRepository } from "../src/notion-context/notion-context.repository";

function queryReturning(rows: unknown[]) {
  const query: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where", "orderBy"]) {
    query[method] = vi.fn(() => query);
  }
  query.limit = vi.fn().mockResolvedValue(rows);
  return query;
}

describe("NotionContextRepository", () => {
  it("maps the editor stored with each retained document revision", async () => {
    const currentEditor = {
      providerUserId: "notion-user-2",
      displayName: "Maya Chen",
      avatarUrl: null,
      kind: "person" as const,
    };
    const previousEditor = {
      providerUserId: "notion-user-1",
      displayName: "Alex Kim",
      avatarUrl: null,
      kind: "person" as const,
    };
    const query = queryReturning([
      {
        documentId: "document-1",
        resourceId: "resource-1",
        title: "Session policy",
        url: "https://notion.so/session-policy",
        lastSyncedAt: new Date("2026-08-20T06:00:00.000Z"),
        versionId: "version-2",
        sourceRevision: "revision-2",
        capturedAt: new Date("2026-08-20T05:00:00.000Z"),
        truncated: false,
        editor: currentEditor,
      },
      {
        documentId: "document-1",
        resourceId: "resource-1",
        title: "Session policy",
        url: "https://notion.so/session-policy",
        lastSyncedAt: new Date("2026-08-20T06:00:00.000Z"),
        versionId: "version-1",
        sourceRevision: "revision-1",
        capturedAt: new Date("2026-08-19T05:00:00.000Z"),
        truncated: false,
        editor: previousEditor,
      },
    ]);
    const database = {
      client: { select: vi.fn(() => query) },
    } as unknown as DatabaseService;
    const repository = new NotionContextRepository(database);

    const documents = await repository.listReviewDocuments("workspace-1");

    expect(documents).toHaveLength(1);
    expect(documents[0]?.versions.map((version) => version.editor)).toEqual([
      currentEditor,
      previousEditor,
    ]);
  });
});
