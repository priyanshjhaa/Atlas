import { describe, expect, it, vi } from "vitest";
import { ImpactAnalysisService } from "../src/impact/impact-analysis.service";
import type { ImpactRepository } from "../src/impact/impact.repository";
import type { RetrievalService } from "../src/intelligence/retrieval.service";

const workspaceId = "01951ca1-2c72-7000-8000-000000000001";
const repositoryId = "01951ca1-2c72-7000-8000-000000000002";

function setup() {
  const repository = {
    repositoryDetails: vi.fn().mockResolvedValue({
      id: repositoryId,
      owner: "atlas",
      name: "identity",
      defaultBranch: "main",
      lastSyncedRevision: "revision-1",
    }),
    filesByPaths: vi.fn().mockResolvedValue([
      {
        id: "file-session",
        path: "src/session.ts",
        language: "typescript",
        sourceRevision: "revision-1",
      },
    ]),
    matchingSymbols: vi.fn().mockResolvedValue([
      {
        id: "symbol-refresh",
        fileId: "file-session",
        filePath: "src/session.ts",
        name: "refreshSession",
        kind: "function",
        lineStart: 12,
        lineEnd: 18,
        exported: true,
      },
    ]),
    incomingRelationships: vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "relationship-consumer",
          sourceFileId: "file-api",
          sourcePath: "src/api.ts",
          targetFileId: "file-session",
          targetPath: "src/session.ts",
          kind: "imports",
          provenance: "typescript_static_import",
          confidence: 1,
          sourceRevision: "revision-1",
          evidence: {
            importSpecifier: "./session",
            line: 4,
          },
        },
      ])
      .mockResolvedValueOnce([]),
  };
  const retrieval = {
    search: vi.fn().mockResolvedValue({
      query: "rotate refresh session",
      lowConfidence: false,
      results: [
        {
          id: "chunk-session",
          score: 0.84,
          reason: "Matched refreshSession",
          excerpt: "export function refreshSession() {}",
          citation: {
            repositoryId,
            filePath: "src/session.ts",
            lineStart: 12,
            lineEnd: 18,
            symbol: "refreshSession",
            provenance: "indexed_source_chunk",
          },
        },
        {
          id: "chunk-readme",
          score: 0.79,
          reason: "Documentation used similar words",
          excerpt: "Session documentation",
          citation: {
            repositoryId,
            filePath: "README.md",
            provenance: "indexed_source_chunk",
          },
        },
        {
          id: "chunk-weak-code",
          score: 0.31,
          reason: "Weak semantic match",
          excerpt: "export function unrelated() {}",
          citation: {
            repositoryId,
            filePath: "src/unrelated.ts",
            provenance: "indexed_source_chunk",
          },
        },
      ],
    }),
  };
  return {
    repository,
    retrieval,
    service: new ImpactAnalysisService(
      repository as unknown as ImpactRepository,
      retrieval as unknown as RetrievalService,
    ),
  };
}

describe("ImpactAnalysisService", () => {
  it("resolves indexed anchors and traverses observed incoming imports", async () => {
    const { repository, service } = setup();

    const report = await service.analyze(workspaceId, {
      mode: "planned",
      repositoryId,
      description: "Rotate the refresh session contract.",
      scope: "repository",
      anchors: ["refreshSession"],
    });

    expect(report.resolvedEntities[0]).toMatchObject({
      kind: "symbol",
      name: "refreshSession",
      filePath: "src/session.ts",
    });
    expect(report.status).toBe("complete");
    expect(report.answer).toContain("src/session.ts");
    expect(report.recommendations).toEqual(
      expect.arrayContaining([
        expect.stringContaining("src/session.ts"),
        expect.stringContaining("src/api.ts"),
      ]),
    );
    expect(report.directImpacts[0]).toMatchObject({
      classification: "direct",
      provenance: "indexed_source_chunk",
    });
    expect(report.downstreamImpacts[0]).toMatchObject({
      filePath: "src/api.ts",
      hop: 1,
      provenance: "typescript_static_import",
      confidence: 1,
    });
    expect(report.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "src/api.ts",
          lineStart: 4,
          provenance: "typescript_static_import",
        }),
      ]),
    );
    expect(repository.filesByPaths).toHaveBeenCalledWith(
      workspaceId,
      repositoryId,
      ["src/session.ts"],
    );
    expect(repository.incomingRelationships).toHaveBeenCalledTimes(2);
  });

  it("reports analysis gaps explicitly instead of inventing consumers", async () => {
    const { repository, retrieval, service } = setup();
    repository.filesByPaths.mockResolvedValue([]);
    repository.matchingSymbols.mockResolvedValue([]);
    repository.incomingRelationships.mockResolvedValue([]);
    retrieval.search.mockResolvedValue({
      query: "unknown",
      lowConfidence: true,
      results: [],
    });

    const report = await service.analyze(workspaceId, {
      mode: "planned",
      repositoryId,
      description: "Change an undocumented runtime integration.",
      scope: "workspace",
      anchors: [],
    });

    expect(report.directImpacts).toHaveLength(0);
    expect(report.downstreamImpacts).toHaveLength(0);
    expect(report.unknownImpacts.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "unknown:unresolved-input",
        "unknown:no-observed-consumers",
        "unknown:cross-repository-links",
      ]),
    );
    expect(report.limitations).toEqual(
      expect.arrayContaining([
        expect.stringContaining("cross-repository"),
        expect.stringContaining("confidence is low"),
      ]),
    );
    expect(report.status).toBe("insufficient_evidence");
    expect(report.risk).toMatchObject({
      level: "insufficient",
      score: null,
    });
    expect(report.answer).toContain("cannot answer");
  });
});
