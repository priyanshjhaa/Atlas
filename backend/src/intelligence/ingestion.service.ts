import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mkdir, rm } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { Environment } from "../config/environment";
import { GitHubAppService } from "../connectors/github-app.service";
import { ArchitectureBuilderService } from "./architecture-builder.service";
import { EmbeddingsService } from "./embeddings.service";
import { IntelligenceRepository } from "./intelligence.repository";
import type { IngestionSummary } from "./intelligence.types";
import { ParserService } from "./parser.service";
import { RelationshipExtractorService } from "./relationship-extractor.service";
import { SourceDiscoveryService } from "./source-discovery.service";
import { TypeCheckerService } from "./type-checker.service";
import { WorkspaceAnalyzerService } from "./workspace-analyzer.service";

export class IngestionCancelledError extends Error {
  constructor() {
    super("Repository ingestion was cancelled.");
  }
}

interface IngestionInput {
  workspaceId: string;
  repositoryId: string;
  repositoryName: string;
  owner: string;
  installationId: string;
  revision: string;
  progress: (percent: number, stage: string) => Promise<void>;
  cancellationRequested: () => Promise<boolean>;
}

@Injectable()
export class IngestionService {
  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly github: GitHubAppService,
    private readonly discovery: SourceDiscoveryService,
    private readonly parser: ParserService,
    private readonly workspaceAnalyzer: WorkspaceAnalyzerService,
    private readonly typeChecker: TypeCheckerService,
    private readonly relationships: RelationshipExtractorService,
    private readonly embeddings: EmbeddingsService,
    private readonly architecture: ArchitectureBuilderService,
    private readonly repository: IntelligenceRepository,
  ) {}

  async ingest(input: IngestionInput): Promise<IngestionSummary> {
    const storageRoot = resolve(
      this.config.get("REPOSITORY_STORAGE_PATH", { infer: true }),
    );
    const syncPath = resolve(
      storageRoot,
      input.repositoryId,
      `${input.revision.slice(0, 12)}-${crypto.randomUUID()}`,
    );
    const scopedRelativePath = relative(storageRoot, syncPath);
    if (
      !scopedRelativePath ||
      scopedRelativePath.startsWith("..") ||
      resolve(storageRoot, scopedRelativePath) !== syncPath
    ) {
      throw new Error("Unsafe repository storage path.");
    }

    try {
      await this.checkCancellation(input);
      await input.progress(12, "downloading_repository_archive");
      await mkdir(syncPath, { recursive: true });
      await this.github.downloadRepositoryArchive({
        installationId: input.installationId,
        owner: input.owner,
        repository: input.repositoryName,
        revision: input.revision,
        destinationPath: syncPath,
      });

      await this.checkCancellation(input);
      await input.progress(32, "discovering_source_files");
      const files = await this.discovery.collect(syncPath);

      await this.checkCancellation(input);
      await input.progress(52, "parsing_symbols_and_chunks");
      const parsedFiles = this.parser.parseFiles(files);
      const workspaceAnalysis = this.workspaceAnalyzer.analyze(parsedFiles);
      const typeCheckerAnalysis = this.typeChecker.analyze(
        parsedFiles,
        syncPath,
        workspaceAnalysis,
      );
      const observedRelationships = this.relationships.extract(
        parsedFiles,
        typeCheckerAnalysis,
      );

      await this.checkCancellation(input);
      await input.progress(72, "generating_retrieval_embeddings");
      const chunkInputs = parsedFiles.flatMap((file) =>
        file.chunks.map((chunk) => ({
          key: this.repository.embeddingKey(file.path, chunk.chunkIndex),
          content: [
            `File: ${file.path}`,
            `Language: ${file.language}`,
            chunk.summary ? `Summary: ${chunk.summary}` : "",
            chunk.content,
          ]
            .filter(Boolean)
            .join("\n"),
        })),
      );
      const vectors = await this.embeddings.embedTexts(
        chunkInputs.map((chunk) => chunk.content),
      );
      const embeddingMap = new Map(
        chunkInputs.map((chunk, index) => [chunk.key, vectors[index]]),
      );
      const snapshot = this.architecture.build(
        input.repositoryName,
        parsedFiles,
        observedRelationships,
        typeCheckerAnalysis,
        workspaceAnalysis,
      );

      await this.checkCancellation(input);
      await input.progress(90, "persisting_intelligence_graph");
      const persistence = await this.repository.persist({
        workspaceId: input.workspaceId,
        repositoryId: input.repositoryId,
        sourceRevision: input.revision,
        files: parsedFiles,
        relationships: observedRelationships,
        packages: workspaceAnalysis.packages,
        typeChecker: typeCheckerAnalysis,
        embeddings: embeddingMap,
        architecture: snapshot,
      });

      return {
        filesIndexed: parsedFiles.length,
        chunksCreated: parsedFiles.reduce(
          (count, file) => count + file.chunks.length,
          0,
        ),
        symbolsExtracted: parsedFiles.reduce(
          (count, file) => count + file.symbols.length,
          0,
        ),
        callsDetected: parsedFiles.reduce(
          (count, file) => count + file.calls.length,
          0,
        ),
        relationshipsExtracted: observedRelationships.length,
        languages: [...new Set(parsedFiles.map((file) => file.language))].sort(),
        embeddingProvider: this.embeddings.provider(),
        typeChecker: {
          filesAnalyzed: typeCheckerAnalysis.filesAnalyzed,
          importsResolved: typeCheckerAnalysis.importsResolved,
          pathAliasesResolved:
            typeCheckerAnalysis.pathAliasesResolved,
          workspaceImportsResolved:
            typeCheckerAnalysis.workspaceImportsResolved,
          publicApiSymbols:
            typeCheckerAnalysis.publicApiSymbols.length,
          diagnosticCount: typeCheckerAnalysis.diagnostics.length,
          configFilePath:
            typeCheckerAnalysis.configuration.configFilePath,
          configuredRootFiles:
            typeCheckerAnalysis.configuration.configuredRootFiles,
          projectConfigPaths:
            typeCheckerAnalysis.configuration.projectConfigPaths,
          projectReferences:
            typeCheckerAnalysis.configuration.projectReferences,
        },
        workspace: {
          packageCount: workspaceAnalysis.packages.length,
          packageNames: workspaceAnalysis.packages.map(
            (item) => item.name,
          ),
          warningCount: workspaceAnalysis.warnings.length,
          relationshipsLinked:
            persistence.packageRelationshipsPersisted,
          ambiguousDependencies:
            persistence.ambiguousPackageDependencies,
          apiSymbolsLinked:
            persistence.apiSymbolRelationshipsPersisted,
          apiCallsLinked:
            persistence.apiCallRelationshipsPersisted,
          ambiguousApiImports:
            persistence.ambiguousApiImports,
          relationshipObservationsRecorded:
            persistence.relationshipObservationsPersisted,
          graphEntitiesProjected:
            persistence.graphEntitiesProjected,
          graphRelationshipsProjected:
            persistence.graphRelationshipsProjected,
          inferredGraphRelationships:
            persistence.inferredGraphRelationships,
        },
      };
    } finally {
      await rm(syncPath, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async checkCancellation(input: IngestionInput): Promise<void> {
    if (await input.cancellationRequested()) {
      throw new IngestionCancelledError();
    }
  }
}
