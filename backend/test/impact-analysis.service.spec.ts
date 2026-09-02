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
    hasWorkspaceRelationshipIndex: vi.fn().mockResolvedValue(false),
    incomingWorkspaceRelationships: vi.fn().mockResolvedValue([]),
    incomingHistoricalRelationships: vi.fn().mockResolvedValue([]),
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
    workspaceSearch: vi.fn().mockResolvedValue({
      query: "rotate refresh session",
      lowConfidence: false,
      filters: { repositoryId: null, providers: ["notion"] },
      results: [],
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
  it("adds cited Notion documentation without changing deterministic risk or findings", async () => {
    const { retrieval, service } = setup();
    retrieval.workspaceSearch.mockResolvedValue({
      query: "rotate refresh session",
      lowConfidence: false,
      filters: { repositoryId: null, providers: ["notion"] },
      results: [
        {
          id: "notion-adr",
          provider: "notion",
          score: 0.82,
          lexicalMatches: 2,
          title: "ADR: Session rotation",
          excerpt: "Rotate refresh tokens after every successful exchange.",
          reason: "Notion documentation directly matched the search.",
          freshness: "2026-08-02T12:00:00.000Z",
          citation: {
            provider: "notion",
            title: "ADR: Session rotation",
            url: "https://notion.so/session-rotation",
            sourceRevision: "notion-revision-1",
            lastEditedAt: "2026-08-01T12:00:00.000Z",
            lastEditedBy: {
              providerUserId: "notion-user-1",
              displayName: "Maya Chen",
              avatarUrl: null,
              kind: "person",
            },
            heading: "Decision",
            provenance: "indexed_notion_chunk",
          },
        },
      ],
    });

    const report = await service.analyze(workspaceId, {
      mode: "planned",
      repositoryId,
      description: "Rotate refresh session tokens",
      scope: "repository",
      anchors: ["src/session.ts"],
    });

    expect(report.documentationContext).toEqual({
      status: "available",
      evidence: [
        expect.objectContaining({
          id: "notion:notion-adr",
          provider: "notion",
          title: "ADR: Session rotation",
          sourceRevision: "notion-revision-1",
          relevance: 0.82,
        }),
      ],
    });
    expect(
      report.documentationContext?.evidence[0]?.lastEditedBy?.displayName,
    ).toBe("Maya Chen");
    expect(report.risk.level).toBe("low");
    expect(report.directImpacts).toHaveLength(1);
    expect(report.downstreamImpacts).toHaveLength(1);
    expect(report.evidence.every((item) => !item.id.startsWith("notion:"))).toBe(
      true,
    );
  });

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

  it("does not treat cross-repository retrieval expansion as a local change anchor", async () => {
    const { repository, retrieval, service } = setup();
    retrieval.search.mockResolvedValue({
      query: "refresh session",
      lowConfidence: false,
      results: [
        {
          id: "chunk-cross-repository",
          score: 1,
          lexicalMatches: 2,
          reason: "Graph-related consumer",
          excerpt: "refreshSession();",
          citation: {
            repositoryId: "repository-web",
            filePath: "src/session-client.ts",
            symbol: "refreshSession",
            provenance: "indexed_source_chunk",
          },
        },
        {
          id: "chunk-session",
          score: 0.84,
          lexicalMatches: 2,
          reason: "Matched refreshSession",
          excerpt: "export function refreshSession() {}",
          citation: {
            repositoryId,
            filePath: "src/session.ts",
            symbol: "refreshSession",
            provenance: "indexed_source_chunk",
          },
        },
      ],
    });

    const report = await service.analyze(workspaceId, {
      mode: "planned",
      repositoryId,
      description: "Rotate the refresh session contract.",
      scope: "repository",
      anchors: ["refreshSession"],
    });

    expect(repository.filesByPaths).toHaveBeenCalledWith(
      workspaceId,
      repositoryId,
      ["src/session.ts"],
    );
    expect(report.evidence).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "src/session-client.ts",
        }),
      ]),
    );
  });

  it("reports analysis gaps explicitly instead of inventing consumers", async () => {
    const { repository, retrieval, service } = setup();
    repository.filesByPaths.mockResolvedValue([]);
    repository.matchingSymbols.mockResolvedValue([]);
    repository.incomingRelationships.mockReset().mockResolvedValue([]);
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

  it("reports indexed cross-repository API consumers for workspace analysis", async () => {
    const { repository, service } = setup();
    repository.hasWorkspaceRelationshipIndex.mockResolvedValue(true);
    repository.incomingWorkspaceRelationships.mockResolvedValue([
      {
        id: "cross-call",
        sourceRepositoryId: "repository-web",
        sourceRepository: "atlas/web",
        sourceFileId: "file-session-client",
        sourcePath: "src/session-client.ts",
        targetRepositoryId: repositoryId,
        targetRepository: "atlas/identity",
        targetPath: "src/session.ts",
        targetSymbol: "refreshSession",
        kind: "calls_api",
        provenance: "typescript_public_api_call",
        confidence: 1,
        sourceRevision: "web-revision-1",
        targetRevision: "revision-1",
        evidence: {
          importedName: "refreshSession",
          lines: [8],
        },
      },
    ]);

    const report = await service.analyze(workspaceId, {
      mode: "planned",
      repositoryId,
      description: "Rotate the refresh session contract.",
      scope: "workspace",
      anchors: ["refreshSession"],
    });

    expect(report.downstreamImpacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repositoryId: "repository-web",
          repository: "atlas/web",
          filePath: "src/session-client.ts",
          symbol: "refreshSession",
          provenance: "typescript_public_api_call",
        }),
      ]),
    );
    expect(report.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repositoryId: "repository-web",
          repository: "atlas/web",
          filePath: "src/session-client.ts",
          lineStart: 8,
          provenance: "typescript_public_api_call",
          sourceRevision: "web-revision-1",
        }),
      ]),
    );
    expect(report.unknownImpacts.map((item) => item.id)).not.toContain(
      "unknown:cross-repository-links",
    );
    expect(report.limitations.join("\n")).toContain(
      "Cross-repository traversal covers",
    );
    expect(report.limitations.join("\n")).not.toContain(
      "traversal is not available",
    );
    expect(report.relationshipPath).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repository: "atlas/web",
          filePath: "src/session-client.ts",
        }),
      ]),
    );
    expect(repository.incomingWorkspaceRelationships).toHaveBeenCalledWith(
      workspaceId,
      repositoryId,
      ["symbol-refresh"],
      ["file-session"],
    );
  });

  it("keeps historical relationships distinct from current consumers", async () => {
    const { repository, service } = setup();
    repository.incomingRelationships.mockReset().mockResolvedValue([]);
    repository.hasWorkspaceRelationshipIndex.mockResolvedValue(true);
    repository.incomingWorkspaceRelationships.mockResolvedValue([]);
    repository.incomingHistoricalRelationships.mockResolvedValue([
      {
        id: "historical-call",
        stableKey: "symbol:historical-call",
        sourceRepositoryId: "repository-web",
        sourceRepository: "atlas/web",
        sourcePath: "src/legacy-session-client.ts",
        sourceEntityKind: "symbol",
        targetRepositoryId: repositoryId,
        targetRepository: "atlas/identity",
        targetPath: "src/session.ts",
        targetSymbol: "refreshSession",
        targetEntityKind: "symbol",
        kind: "calls_api",
        originalProvenance: "typescript_public_api_call",
        confidence: 1,
        observedRevision: "historical-revision-123",
        sourceRevision: "web-revision-old",
        targetRevision: "identity-revision-old",
        observedAt: new Date("2026-07-01T00:00:00.000Z"),
        evidence: {
          importedName: "refreshSession",
          lines: [11],
        },
      },
    ]);

    const report = await service.analyze(workspaceId, {
      mode: "planned",
      repositoryId,
      description: "Rotate the refresh session contract.",
      scope: "workspace",
      anchors: ["refreshSession"],
    });

    expect(report.downstreamImpacts).toEqual([
      expect.objectContaining({
        repository: "atlas/web",
        filePath: "src/legacy-session-client.ts",
        provenance: "historical_relationship",
        confidence: 0.75,
      }),
    ]);
    expect(report.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repository: "atlas/web",
          filePath: "src/legacy-session-client.ts",
          lineStart: 11,
          provenance: "historical_relationship",
          sourceRevision: "web-revision-old",
        }),
      ]),
    );
    expect(report.answer).toContain("0 current consumers");
    expect(report.answer).toContain("1 historical relationship");
    expect(report.unknownImpacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "unknown:no-observed-consumers",
        }),
      ]),
    );
    expect(report.limitations.join("\n")).toContain(
      "Historical relationships record previously indexed structure",
    );
    expect(report.risk.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("1 historical relationship"),
      ]),
    );
    expect(repository.incomingHistoricalRelationships).toHaveBeenCalledWith(
      workspaceId,
      repositoryId,
      ["symbol-refresh"],
      ["file-session"],
      "workspace",
    );
  });

  it("keeps Better Auth and JWT boundaries together in migration guidance", async () => {
    const { repository, retrieval, service } = setup();
    repository.filesByPaths.mockResolvedValue([
      {
        id: "file-auth",
        path: "lib/auth.ts",
        language: "typescript",
        sourceRevision: "revision-1",
      },
      {
        id: "file-jwt",
        path: "backend/src/auth/jwt-verifier.ts",
        language: "typescript",
        sourceRevision: "revision-1",
      },
    ]);
    repository.matchingSymbols.mockResolvedValue([
      {
        id: "symbol-auth",
        fileId: "file-auth",
        filePath: "lib/auth.ts",
        name: "auth",
        kind: "variable",
        exported: true,
      },
      {
        id: "symbol-jwt",
        fileId: "file-jwt",
        filePath: "backend/src/auth/jwt-verifier.ts",
        name: "verifyJwt",
        kind: "function",
        exported: true,
      },
    ]);
    repository.incomingRelationships.mockReset().mockResolvedValue([]);
    retrieval.search.mockResolvedValue({
      query: "better auth jwt",
      lowConfidence: false,
      results: [
        {
          id: "chunk-auth",
          score: 0.9,
          lexicalMatches: 2,
          reason: "Matched Better Auth",
          excerpt: "export const auth = betterAuth({});",
          citation: {
            repositoryId,
            filePath: "lib/auth.ts",
            symbol: "auth",
            provenance: "indexed_source_chunk",
          },
        },
        {
          id: "chunk-jwt",
          score: 0.88,
          lexicalMatches: 2,
          reason: "Matched JWT verification",
          excerpt: "export function verifyJwt() {}",
          citation: {
            repositoryId,
            filePath: "backend/src/auth/jwt-verifier.ts",
            symbol: "verifyJwt",
            provenance: "indexed_source_chunk",
          },
        },
      ],
    });

    const report = await service.analyze(workspaceId, {
      mode: "planned",
      repositoryId,
      description: "Replace Better Auth sessions with a JWT boundary.",
      scope: "repository",
      anchors: ["lib/auth.ts", "backend/src/auth/jwt-verifier.ts"],
    });

    expect(report.answer).toContain("cross-boundary authentication migration");
    expect(report.answer).toContain("lib/auth.ts");
    expect(report.answer).toContain("backend/src/auth/jwt-verifier.ts");
    expect(report.recommendations.join("\n")).toContain("JWT claims");
    expect(report.unknownImpacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "unknown:no-observed-consumers" }),
      ]),
    );
  });

  it("keeps deleted and newly introduced PR files unresolved against the base index", async () => {
    const { repository, retrieval, service } = setup();
    repository.filesByPaths.mockResolvedValue([]);
    repository.matchingSymbols.mockResolvedValue([]);
    repository.incomingRelationships.mockReset().mockResolvedValue([]);
    retrieval.search.mockResolvedValue({
      query: "new and deleted files",
      lowConfidence: true,
      results: [],
    });

    const report = await service.analyze(workspaceId, {
      mode: "pull-request",
      repositoryId,
      description: "Add a new API contract and remove its legacy adapter.",
      scope: "repository",
      anchors: ["src/new-contract.ts", "src/legacy-adapter.ts"],
      pullRequest: {
        number: 42,
        title: "Replace the legacy API contract",
        url: "https://github.com/atlas/identity/pull/42",
        author: "engineer",
        baseRevision: "revision-1",
        headRevision: "revision-2",
        analysisBudget: {
          totalChangedFiles: 2,
          filesRetrieved: 2,
          filesWithPatchContext: 2,
          patchCharactersAnalyzed: 200,
          githubFileLimitReached: false,
        },
        changedFiles: [
          {
            path: "src/new-contract.ts",
            status: "added",
            additions: 40,
            deletions: 0,
          },
          {
            path: "src/legacy-adapter.ts",
            status: "removed",
            additions: 0,
            deletions: 30,
          },
        ],
      },
    });

    expect(report.status).toBe("insufficient_evidence");
    expect(report.directImpacts).toHaveLength(0);
    expect(report.unknownImpacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "unknown:unresolved-input" }),
      ]),
    );
    expect(report.limitations.join("\n")).toContain(
      "newly introduced files and symbols remain unknown",
    );
    expect(report.limitations.join("\n")).toContain(
      "GitHub reported 2 changed files",
    );
  });
});
