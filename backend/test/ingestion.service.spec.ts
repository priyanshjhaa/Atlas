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
import type { ObservedRelationship } from "../src/intelligence/intelligence.types";

describe("IngestionService", () => {
  it("runs the forked pipeline and persists Atlas-scoped intelligence", async () => {
    const storageRoot = await mkdtemp(
      join(tmpdir(), "atlas-ingestion-test-"),
    );
    const persist = vi.fn(async (input: unknown) => {
      void input;
    });
    const config = {
      get: (key: keyof Environment) => {
        if (key === "REPOSITORY_STORAGE_PATH") return storageRoot;
        if (key === "EMBEDDINGS_PROVIDER") return "local";
        return undefined;
      },
    } as unknown as ConfigService<Environment, true>;
    const github = {
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
        progress: vi.fn(async () => undefined),
        cancellationRequested: vi.fn(async () => false),
      });

      expect(summary).toMatchObject({
        filesIndexed: 2,
        symbolsExtracted: 2,
        relationshipsExtracted: 1,
        embeddingProvider: "local",
        typeChecker: {
          filesAnalyzed: 2,
          importsResolved: 1,
          diagnosticCount: 0,
        },
      });
      expect(persist).toHaveBeenCalledOnce();
      const persisted = persist.mock.calls[0]?.[0] as {
        workspaceId: string;
        repositoryId: string;
        sourceRevision: string;
        relationships: ObservedRelationship[];
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
    } finally {
      await rm(storageRoot, { recursive: true, force: true });
    }
  });
});
