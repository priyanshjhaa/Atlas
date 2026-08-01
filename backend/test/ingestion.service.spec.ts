import type { ConfigService } from "@nestjs/config";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { Environment } from "../src/config/environment";
import type { GitHubAppService } from "../src/connectors/github-app.service";
import { ArchitectureBuilderService } from "../src/intelligence/architecture-builder.service";
import { EmbeddingsService } from "../src/intelligence/embeddings.service";
import { IngestionService } from "../src/intelligence/ingestion.service";
import type { IntelligenceRepository } from "../src/intelligence/intelligence.repository";
import { ParserService } from "../src/intelligence/parser.service";
import { RelationshipExtractorService } from "../src/intelligence/relationship-extractor.service";
import { SourceDiscoveryService } from "../src/intelligence/source-discovery.service";
import { TypeCheckerService } from "../src/intelligence/type-checker.service";
import { WorkspaceAnalyzerService } from "../src/intelligence/workspace-analyzer.service";
import type { ObservedRelationship } from "../src/intelligence/intelligence.types";

describe("IngestionService", () => {
  it("runs the forked pipeline and persists Atlas-scoped intelligence", async () => {
    const storageRoot = await mkdtemp(
      join(tmpdir(), "atlas-ingestion-test-"),
    );
    const persist = vi.fn(async (input: unknown) => {
      void input;
      return {
        packagesPersisted: 1,
        packageRelationshipsPersisted: 0,
        ambiguousPackageDependencies: 0,
        apiSymbolRelationshipsPersisted: 0,
        apiCallRelationshipsPersisted: 0,
        ambiguousApiImports: 0,
        relationshipObservationsPersisted: 1,
        graphEntitiesProjected: 5,
        graphRelationshipsProjected: 4,
        inferredGraphRelationships: 1,
        historyCommitsPersisted: 1,
        historyFilesPersisted: 1,
      };
    });
    const config = {
      get: (key: keyof Environment) => {
        if (key === "REPOSITORY_STORAGE_PATH") return storageRoot;
        if (key === "EMBEDDINGS_PROVIDER") return "local";
        return undefined;
      },
    } as unknown as ConfigService<Environment, true>;
    const getRepositoryHistory = vi.fn(async () => ({
        baseRevision: "previous-sha",
        headRevision: "abcdef1234567890",
        status: "ahead",
        aheadBy: 1,
        behindBy: 0,
        totalCommits: 1,
        commits: [
          {
            sha: "abcdef1234567890",
            message: "Update API",
            htmlUrl:
              "https://github.com/atlas/api/commit/abcdef1234567890",
            authorName: "Atlas Engineer",
            authorLogin: "atlas-engineer",
            authoredAt: "2026-08-01T00:00:00.000Z",
            committedAt: "2026-08-01T00:00:00.000Z",
            parentShas: ["previous-sha"],
          },
        ],
        files: [
          {
            path: "src/api.ts",
            previousPath: null,
            status: "modified",
            additions: 2,
            deletions: 1,
            changes: 3,
          },
        ],
        commitsTruncated: false,
        filesTruncated: false,
      }));
    const github = {
      getRepositoryHistory,
      downloadRepositoryArchive: vi.fn(
        async ({ destinationPath }: { destinationPath: string }) => {
          await mkdir(join(destinationPath, "src"), { recursive: true });
          await writeFile(
            join(destinationPath, "src", "api.ts"),
            'import { user } from "./user";\nexport const handler = () => user;\n',
          );
          await writeFile(
            join(destinationPath, "src", "user.ts"),
            "export const user = { id: 1 };\n",
          );
          await writeFile(
            join(destinationPath, "tsconfig.json"),
            JSON.stringify({
              compilerOptions: {
                strict: true,
                target: "ES2020",
              },
              include: ["src/**/*.ts"],
            }),
          );
          await writeFile(
            join(destinationPath, "package.json"),
            JSON.stringify({
              name: "@atlas/api",
              version: "1.0.0",
              source: "./src/api.ts",
            }),
          );
          return { bytesDownloaded: 100 };
        },
      ),
    } as unknown as GitHubAppService;
    const repository = {
      embeddingKey: (path: string, index: number) => `${path}:${index}`,
      persist,
    } as unknown as IntelligenceRepository;
    const service = new IngestionService(
      config,
      github,
      new SourceDiscoveryService(),
      new ParserService(),
      new WorkspaceAnalyzerService(),
      new TypeCheckerService(),
      new RelationshipExtractorService(),
      new EmbeddingsService(config),
      new ArchitectureBuilderService(),
      repository,
    );

    try {
      const summary = await service.ingest({
        workspaceId: "workspace-1",
        repositoryId: "repository-1",
        repositoryName: "api",
        owner: "atlas",
        installationId: "42",
        revision: "abcdef1234567890",
        previousRevision: "previous-sha",
        progress: vi.fn(async () => undefined),
        cancellationRequested: vi.fn(async () => false),
      });

      expect(summary).toMatchObject({
        filesIndexed: 4,
        symbolsExtracted: 2,
        callsDetected: 0,
        relationshipsExtracted: 1,
        embeddingProvider: "local",
        history: {
          baseRevision: "previous-sha",
          headRevision: "abcdef1234567890",
          status: "ahead",
          totalCommits: 1,
          commitsCaptured: 1,
          filesCaptured: 1,
          commitsPersisted: 1,
          filesPersisted: 1,
          commitsTruncated: false,
          filesTruncated: false,
        },
        typeChecker: {
          filesAnalyzed: 2,
          importsResolved: 1,
          pathAliasesResolved: 0,
          workspaceImportsResolved: 0,
          publicApiSymbols: 1,
          diagnosticCount: 0,
          configFilePath: "tsconfig.json",
          configuredRootFiles: 2,
        },
        workspace: {
          packageCount: 1,
          packageNames: ["@atlas/api"],
          warningCount: 0,
          relationshipsLinked: 0,
          ambiguousDependencies: 0,
          apiSymbolsLinked: 0,
          apiCallsLinked: 0,
          ambiguousApiImports: 0,
          relationshipObservationsRecorded: 1,
          graphEntitiesProjected: 5,
          graphRelationshipsProjected: 4,
          inferredGraphRelationships: 1,
        },
      });
      expect(persist).toHaveBeenCalledOnce();
      const persisted = persist.mock.calls[0]?.[0] as {
        workspaceId: string;
        repositoryId: string;
        sourceRevision: string;
        relationships: ObservedRelationship[];
        packages: Array<{ name: string; stableKey?: string }>;
        history: { baseRevision: string | null; headRevision: string };
      };
      expect(persisted).toMatchObject({
        workspaceId: "workspace-1",
        repositoryId: "repository-1",
        sourceRevision: "abcdef1234567890",
      });
      expect(persisted.relationships[0]).toMatchObject({
        provenance: "typescript_static_import",
        confidence: 1,
      });
      expect(persisted.relationships[0]?.evidence).toMatchObject({
        resolvedBy: "typescript_type_checker",
        importedSymbols: [
          expect.objectContaining({
            localName: "user",
            targetPath: "src/user.ts",
          }),
        ],
      });
      expect(persisted.packages).toEqual([
        expect.objectContaining({
          name: "@atlas/api",
        }),
      ]);
      expect(persisted.history).toMatchObject({
        baseRevision: "previous-sha",
        headRevision: "abcdef1234567890",
      });
      expect(getRepositoryHistory).toHaveBeenCalledWith({
        installationId: "42",
        owner: "atlas",
        repository: "api",
        baseRevision: "previous-sha",
        headRevision: "abcdef1234567890",
      });
    } finally {
      await rm(storageRoot, { recursive: true, force: true });
    }
  });
});
