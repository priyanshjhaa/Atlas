import { describe, expect, it, vi } from "vitest";
import type { EmbeddingsService } from "../src/intelligence/embeddings.service";
import type { IntelligenceRepository } from "../src/intelligence/intelligence.repository";
import { RetrievalService } from "../src/intelligence/retrieval.service";

function setup() {
  const repository = {
    repositoryExists: vi.fn().mockResolvedValue(true),
    vectorCandidates: vi.fn().mockResolvedValue([
      {
        id: "chunk-seed",
        filePath: "src/session.ts",
        content: "export function refreshSession() {}",
        summary: "Session implementation",
        metadata: {
          lineStart: 1,
          lineEnd: 3,
          symbol: "refreshSession",
        },
        distance: 0.1,
      },
    ]),
    lexicalCandidates: vi.fn().mockResolvedValue([]),
    graphContextCandidates: vi.fn().mockResolvedValue([
      {
        id: "chunk-consumer",
        repositoryId: "repository-web",
        filePath: "src/session-client.ts",
        content: "refresh session client",
        summary: null,
        metadata: { lineStart: 4, lineEnd: 9 },
        graphContext: {
          seedEntityId: "entity-session",
          relatedEntityId: "entity-client",
          kind: "calls_api",
          classification: "observed",
          provenance: "typescript_public_api_call",
          confidence: 1,
        },
      },
    ]),
  };
  const embeddings = {
    embedTexts: vi.fn().mockResolvedValue([[0.1, 0.2]]),
  };
  return {
    repository,
    service: new RetrievalService(
      repository as unknown as IntelligenceRepository,
      embeddings as unknown as EmbeddingsService,
    ),
  };
}

describe("RetrievalService", () => {
  it("ranks repository and Notion context together with distinct citations", async () => {
    const repository = {
      repositoryExists: vi.fn().mockResolvedValue(true),
      workspaceVectorCandidates: vi.fn().mockResolvedValue([
        {
          id: "code-1",
          repositoryId: "repository-core",
          repositoryName: "core",
          repositoryOwner: "atlas",
          filePath: "src/session.ts",
          content: "rotate refresh token",
          summary: "Session rotation",
          metadata: { symbol: "rotateSession" },
          language: "typescript",
          distance: 0.12,
        },
      ]),
      workspaceLexicalCandidates: vi.fn().mockResolvedValue([]),
      notionVectorCandidates: vi.fn().mockResolvedValue([
        {
          id: "notion-1",
          documentId: "document-1",
          resourceId: "resource-1",
          content: "The ADR requires rotating refresh tokens.",
          tokenCount: 10,
          metadata: { heading: "Decision" },
          sourceRevision: "revision-1",
          title: "ADR 12: Session security",
          url: "https://notion.so/adr-12",
          lastEditedAt: new Date("2026-08-01T12:00:00.000Z"),
          lastSyncedAt: new Date("2026-08-02T12:00:00.000Z"),
          distance: 0.1,
        },
      ]),
      notionLexicalCandidates: vi.fn().mockResolvedValue([]),
    };
    const service = new RetrievalService(
      repository as unknown as IntelligenceRepository,
      {
        embedTexts: vi.fn().mockResolvedValue([[0.1, 0.2]]),
      } as unknown as EmbeddingsService,
    );

    const result = await service.workspaceSearch(
      "workspace-1",
      "rotate refresh token",
    );

    expect(result.results.map((item) => item.provider).sort()).toEqual([
      "github",
      "notion",
    ]);
    expect(
      result.results.find((item) => item.provider === "notion")?.citation,
    ).toMatchObject({
      provider: "notion",
      documentId: "document-1",
      resourceId: "resource-1",
      url: "https://notion.so/adr-12",
      provenance: "indexed_notion_chunk",
    });
    expect(
      result.results.find((item) => item.provider === "github")?.citation,
    ).toMatchObject({
      provider: "github",
      repositoryId: "repository-core",
      provenance: "indexed_source_chunk",
    });
  });

  it("excludes the reviewed Notion document from semantic and lexical retrieval", async () => {
    const repository = {
      repositoryExists: vi.fn().mockResolvedValue(true),
      workspaceVectorCandidates: vi.fn(),
      workspaceLexicalCandidates: vi.fn(),
      notionVectorCandidates: vi.fn().mockResolvedValue([]),
      notionLexicalCandidates: vi.fn().mockResolvedValue([]),
    };
    const service = new RetrievalService(
      repository as unknown as IntelligenceRepository,
      {
        embedTexts: vi.fn().mockResolvedValue([[0.1, 0.2]]),
      } as unknown as EmbeddingsService,
    );

    await service.workspaceSearch("workspace-1", "session policy", {
      providers: ["notion"],
      excludeNotionDocumentId: "document-under-review",
    });

    expect(repository.notionVectorCandidates).toHaveBeenCalledWith(
      "workspace-1",
      [0.1, 0.2],
      "document-under-review",
    );
    expect(repository.notionLexicalCandidates).toHaveBeenCalledWith(
      "workspace-1",
      expect.any(Array),
      "document-under-review",
    );
    expect(repository.workspaceVectorCandidates).not.toHaveBeenCalled();
  });

  it("honors provider and repository filters", async () => {
    const repository = {
      repositoryExists: vi.fn().mockResolvedValue(true),
      workspaceVectorCandidates: vi.fn().mockResolvedValue([]),
      workspaceLexicalCandidates: vi.fn().mockResolvedValue([]),
      notionVectorCandidates: vi.fn(),
      notionLexicalCandidates: vi.fn(),
    };
    const service = new RetrievalService(
      repository as unknown as IntelligenceRepository,
      {
        embedTexts: vi.fn().mockResolvedValue([[0.1, 0.2]]),
      } as unknown as EmbeddingsService,
    );

    const result = await service.workspaceSearch(
      "workspace-1",
      "session",
      { repositoryId: "repository-core", providers: ["github"] },
    );

    expect(repository.workspaceVectorCandidates).toHaveBeenCalledWith(
      "workspace-1",
      "repository-core",
      [0.1, 0.2],
    );
    expect(repository.notionVectorCandidates).not.toHaveBeenCalled();
    expect(result.filters).toEqual({
      repositoryId: "repository-core",
      providers: ["github"],
    });
  });

  it("expands credible matches through current graph edges with source-accurate citations", async () => {
    const { repository, service } = setup();

    const result = await service.search(
      "workspace-1",
      "repository-core",
      "refresh session",
    );

    expect(repository.graphContextCandidates).toHaveBeenCalledWith(
      "workspace-1",
      "repository-core",
      ["src/session.ts"],
    );
    const graphResult = result.results.find(
      (item) => item.id === "chunk-consumer",
    );
    expect(graphResult).toMatchObject({
      reason: "Related through observed calls_api.",
    });
    expect(graphResult?.graphContext).toMatchObject({
      classification: "observed",
      provenance: "typescript_public_api_call",
    });
    expect(graphResult?.citation).toMatchObject({
      repositoryId: "repository-web",
      filePath: "src/session-client.ts",
      provenance: "indexed_source_chunk",
    });
    expect(result.results[0]?.id).toBe("chunk-seed");
    expect(result.lowConfidence).toBe(false);
  });

  it("does not expand from weak vector-only candidates", async () => {
    const { repository, service } = setup();
    repository.vectorCandidates.mockResolvedValue([
      {
        id: "chunk-weak",
        filePath: "src/unrelated.ts",
        content: "unrelated content",
        summary: null,
        metadata: {},
        distance: 0.8,
      },
    ]);
    repository.graphContextCandidates.mockResolvedValue([]);

    const result = await service.search(
      "workspace-1",
      "repository-core",
      "refresh session",
    );

    expect(repository.graphContextCandidates).not.toHaveBeenCalled();
    expect(result.lowConfidence).toBe(true);
  });

  it("ranks observed graph context above equivalent inferred context", async () => {
    const { repository, service } = setup();
    repository.graphContextCandidates.mockResolvedValue([
      {
        id: "chunk-observed",
        repositoryId: "repository-web",
        filePath: "src/observed.ts",
        content: "refresh session",
        summary: null,
        metadata: {},
        graphContext: {
          seedEntityId: "entity-session",
          relatedEntityId: "entity-observed",
          kind: "imports_api",
          classification: "observed",
          provenance: "typescript_public_api_import",
          confidence: 1,
        },
      },
      {
        id: "chunk-inferred",
        repositoryId: "repository-core",
        filePath: "src/inferred.ts",
        content: "refresh session",
        summary: null,
        metadata: {},
        graphContext: {
          seedEntityId: "entity-session",
          relatedEntityId: "entity-inferred",
          kind: "references_symbol",
          classification: "inferred",
          provenance: "typescript_import_binding_inference",
          confidence: 0.7,
        },
      },
    ]);

    const result = await service.search(
      "workspace-1",
      "repository-core",
      "refresh session",
    );
    const observed = result.results.find(
      (item) => item.id === "chunk-observed",
    );
    const inferred = result.results.find(
      (item) => item.id === "chunk-inferred",
    );

    expect(observed?.score).toBeGreaterThan(inferred?.score ?? 1);
  });
});
