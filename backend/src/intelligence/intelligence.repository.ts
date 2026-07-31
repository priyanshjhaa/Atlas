import { Injectable } from "@nestjs/common";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import {
  architectureSnapshots,
  codeChunks,
  codeFiles,
  codeImports,
  codePackages,
  codeRelationships,
  codeSymbols,
  packageRelationships,
  repositories,
  symbolRelationships,
} from "../database/schema";
import type {
  ArchitectureSnapshotData,
  ObservedRelationship,
  ParsedFile,
  TypeCheckerAnalysis,
  WorkspacePackage,
} from "./intelligence.types";
import { ApiSymbolLinkerService } from "./api-symbol-linker.service";
import { PackageLinkerService } from "./package-linker.service";

interface PersistInput {
  workspaceId: string;
  repositoryId: string;
  sourceRevision: string;
  files: ParsedFile[];
  relationships: ObservedRelationship[];
  packages: WorkspacePackage[];
  typeChecker: TypeCheckerAnalysis;
  embeddings: Map<string, number[]>;
  architecture: ArchitectureSnapshotData;
}

interface PersistSummary {
  packagesPersisted: number;
  packageRelationshipsPersisted: number;
  ambiguousPackageDependencies: number;
  apiSymbolRelationshipsPersisted: number;
  ambiguousApiImports: number;
}

interface RetrievedChunkRow extends Record<string, unknown> {
  id: string;
  content: string;
  summary: string | null;
  language: string;
  metadata: Record<string, unknown>;
  filePath: string;
  distance: number;
}

@Injectable()
export class IntelligenceRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly packageLinker: PackageLinkerService,
    private readonly apiSymbolLinker: ApiSymbolLinkerService,
  ) {}

  async persist(input: PersistInput): Promise<PersistSummary> {
    return this.database.client.transaction(async (transaction) => {
      await transaction
        .delete(codeFiles)
        .where(eq(codeFiles.repositoryId, input.repositoryId));
      await transaction
        .delete(codePackages)
        .where(eq(codePackages.repositoryId, input.repositoryId));

      const currentPackages: Array<{
        id: string;
        name: string;
        rootPath: string;
        entryPoints: string[];
        exportMappings: Record<string, string[]>;
      }> = [];
      for (const item of input.packages) {
        const [createdPackage] = await transaction
          .insert(codePackages)
          .values({
          workspaceId: input.workspaceId,
          repositoryId: input.repositoryId,
          stableKey: `${item.name}:${item.rootPath || "."}`,
          name: item.name,
          version: item.version,
          rootPath: item.rootPath,
          manifestPath: item.manifestPath,
          entryPoints: item.entryPoints,
          exportMappings: item.exportMappings,
          dependencies: item.dependencies,
          sourceRevision: input.sourceRevision,
          })
          .returning({
            id: codePackages.id,
            name: codePackages.name,
            rootPath: codePackages.rootPath,
            entryPoints: codePackages.entryPoints,
            exportMappings: codePackages.exportMappings,
          });
        if (!createdPackage) throw new Error("Code package was not persisted.");
        currentPackages.push(createdPackage);
      }

      const fileIds = new Map<string, string>();
      for (const file of input.files) {
        const [createdFile] = await transaction
          .insert(codeFiles)
          .values({
            workspaceId: input.workspaceId,
            repositoryId: input.repositoryId,
            path: file.path,
            language: file.language,
            checksum: file.checksum,
            sizeBytes: file.sizeBytes,
            sourceRevision: input.sourceRevision,
          })
          .returning({ id: codeFiles.id });
        if (!createdFile) throw new Error("Code file was not persisted.");
        fileIds.set(file.path, createdFile.id);

        if (file.symbols.length) {
          const packageItem = currentPackages
            .filter(
              (item) =>
                !item.rootPath ||
                file.path === item.rootPath ||
                file.path.startsWith(`${item.rootPath}/`),
            )
            .sort(
              (left, right) =>
                right.rootPath.length - left.rootPath.length,
            )[0];
          await transaction.insert(codeSymbols).values(
            file.symbols.map((symbol) => {
              const publicApi = input.typeChecker.publicApiSymbols.filter(
                (item) =>
                  item.packageName === packageItem?.name &&
                  item.targetPath === file.path &&
                  item.targetName === symbol.name,
              );
              const exportNames = [
                ...new Set([
                  ...symbol.exportNames,
                  ...publicApi.map((item) => item.exportName),
                ]),
              ];
              const apiSpecifiers = [
                ...new Set(
                  publicApi.flatMap((api) => {
                    const mapped = Object.entries(
                      packageItem?.exportMappings ?? {},
                    )
                      .filter(([, targets]) =>
                        targets.includes(api.entryPoint),
                      )
                      .map(([specifier]) => specifier);
                    if (mapped.length) return mapped;
                    return packageItem?.entryPoints.includes(api.entryPoint)
                      ? [packageItem.name]
                      : [];
                  }),
                ),
              ];
              return {
                workspaceId: input.workspaceId,
                repositoryId: input.repositoryId,
                fileId: createdFile.id,
                packageId: packageItem?.id,
                stableKey: symbol.stableKey,
                name: symbol.name,
                kind: symbol.kind,
                qualifiedName: packageItem
                  ? `${packageItem.name}:${symbol.name}`
                  : `${file.path}:${symbol.name}`,
                lineStart: symbol.lineStart,
                lineEnd: symbol.lineEnd,
                exported: symbol.exported,
                publicApi: publicApi.length > 0,
                exportNames,
                apiSpecifiers,
                sourceRevision: input.sourceRevision,
                metadata: symbol.metadata,
              };
            }),
          );
        }
        if (file.imports.length) {
          const occurrences = new Map<string, number>();
          await transaction.insert(codeImports).values(
            file.imports.map((imported) => {
              const bindingKey = imported.bindings
                .map(
                  (binding) =>
                    `${binding.kind}:${binding.importedName}:${binding.localName}`,
                )
                .join(",");
              const stableBase = `${file.path}:${imported.specifier}:${bindingKey}`;
              const occurrence = (occurrences.get(stableBase) ?? 0) + 1;
              occurrences.set(stableBase, occurrence);
              return {
                workspaceId: input.workspaceId,
                repositoryId: input.repositoryId,
                fileId: createdFile.id,
                stableKey:
                  occurrence === 1
                    ? stableBase
                    : `${stableBase}#${occurrence}`,
                specifier: imported.specifier,
                line: imported.line,
                bindings: imported.bindings,
                sourceRevision: input.sourceRevision,
              };
            }),
          );
        }
        if (file.chunks.length) {
          await transaction.insert(codeChunks).values(
            file.chunks.map((chunk) => ({
              workspaceId: input.workspaceId,
              repositoryId: input.repositoryId,
              fileId: createdFile.id,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              summary: chunk.summary,
              language: chunk.language,
              tokenCount: chunk.tokenCount,
              metadata: chunk.metadata,
              embedding: input.embeddings.get(
                this.embeddingKey(file.path, chunk.chunkIndex),
              ),
            })),
          );
        }
      }

      if (input.relationships.length) {
        await transaction.insert(codeRelationships).values(
          input.relationships.map((relationship) => {
            const sourceFileId = fileIds.get(relationship.sourcePath);
            const targetFileId = fileIds.get(relationship.targetPath);
            if (!sourceFileId || !targetFileId) {
              throw new Error("Relationship references an unknown code file.");
            }
            return {
              workspaceId: input.workspaceId,
              repositoryId: input.repositoryId,
              sourceFileId,
              targetFileId,
              kind: relationship.kind,
              stableKey: relationship.stableKey,
              provenance: relationship.provenance,
              confidence: relationship.confidence,
              sourceRevision: input.sourceRevision,
              evidence: relationship.evidence,
            };
          }),
        );
      }

      await transaction
        .insert(architectureSnapshots)
        .values({
          workspaceId: input.workspaceId,
          repositoryId: input.repositoryId,
          sourceRevision: input.sourceRevision,
          summary: input.architecture.summary,
          moduleMap: input.architecture.moduleMap,
          diagram: input.architecture.diagram,
        })
        .onConflictDoUpdate({
          target: [
            architectureSnapshots.repositoryId,
            architectureSnapshots.sourceRevision,
          ],
          set: {
            summary: input.architecture.summary,
            moduleMap: input.architecture.moduleMap,
            diagram: input.architecture.diagram,
            generatedAt: new Date(),
          },
        });

      const workspacePackages = await transaction
        .select({
          id: codePackages.id,
          workspaceId: codePackages.workspaceId,
          repositoryId: codePackages.repositoryId,
          name: codePackages.name,
          sourceRevision: codePackages.sourceRevision,
          dependencies: codePackages.dependencies,
          entryPoints: codePackages.entryPoints,
          exportMappings: codePackages.exportMappings,
        })
        .from(codePackages)
        .where(eq(codePackages.workspaceId, input.workspaceId));
      const linked = this.packageLinker.link(
        workspacePackages,
        input.repositoryId,
      );
      if (linked.relationships.length) {
        await transaction
          .insert(packageRelationships)
          .values(linked.relationships);
      }
      const workspaceImports = await transaction
        .select({
          id: codeImports.id,
          workspaceId: codeImports.workspaceId,
          repositoryId: codeImports.repositoryId,
          fileId: codeImports.fileId,
          filePath: codeFiles.path,
          specifier: codeImports.specifier,
          line: codeImports.line,
          bindings: codeImports.bindings,
          sourceRevision: codeImports.sourceRevision,
        })
        .from(codeImports)
        .innerJoin(codeFiles, eq(codeFiles.id, codeImports.fileId))
        .where(eq(codeImports.workspaceId, input.workspaceId));
      const workspaceSymbols = await transaction
        .select({
          id: codeSymbols.id,
          workspaceId: codeSymbols.workspaceId,
          repositoryId: codeSymbols.repositoryId,
          packageId: codeSymbols.packageId,
          filePath: codeFiles.path,
          stableKey: codeSymbols.stableKey,
          name: codeSymbols.name,
          exportNames: codeSymbols.exportNames,
          apiSpecifiers: codeSymbols.apiSpecifiers,
          publicApi: codeSymbols.publicApi,
          sourceRevision: codeSymbols.sourceRevision,
        })
        .from(codeSymbols)
        .innerJoin(codeFiles, eq(codeFiles.id, codeSymbols.fileId))
        .where(eq(codeSymbols.workspaceId, input.workspaceId));
      const apiLinks = this.apiSymbolLinker.link(
        workspaceImports,
        workspacePackages,
        workspaceSymbols,
        input.repositoryId,
      );
      if (apiLinks.relationships.length) {
        await transaction
          .insert(symbolRelationships)
          .values(apiLinks.relationships);
      }
      return {
        packagesPersisted: input.packages.length,
        packageRelationshipsPersisted: linked.relationships.length,
        ambiguousPackageDependencies: linked.ambiguousDependencies,
        apiSymbolRelationshipsPersisted: apiLinks.relationships.length,
        ambiguousApiImports:
          apiLinks.ambiguousPackageImports +
          apiLinks.ambiguousSymbolImports,
      };
    });
  }

  async architecture(workspaceId: string, repositoryId: string) {
    const [snapshot] = await this.database.client
      .select()
      .from(architectureSnapshots)
      .where(
        and(
          eq(architectureSnapshots.workspaceId, workspaceId),
          eq(architectureSnapshots.repositoryId, repositoryId),
        ),
      )
      .orderBy(desc(architectureSnapshots.generatedAt))
      .limit(1);
    return snapshot ?? null;
  }

  async vectorCandidates(
    workspaceId: string,
    repositoryId: string,
    embedding: number[],
  ): Promise<RetrievedChunkRow[]> {
    const vectorValue = `[${embedding.join(",")}]`;
    const result = await this.database.client.execute<RetrievedChunkRow>(sql`
      select
        c.id,
        c.content,
        c.summary,
        c.language,
        c.metadata,
        f.path as "filePath",
        c.embedding <=> ${vectorValue}::vector as distance
      from ${codeChunks} c
      inner join ${codeFiles} f on f.id = c.file_id
      where c.workspace_id = ${workspaceId}
        and c.repository_id = ${repositoryId}
        and c.embedding is not null
      order by c.embedding <=> ${vectorValue}::vector
      limit 24
    `);
    return result.rows;
  }

  async lexicalCandidates(
    workspaceId: string,
    repositoryId: string,
    terms: string[],
  ) {
    const termFilters = terms.flatMap((term) => [
      ilike(codeFiles.path, `%${term}%`),
      ilike(codeChunks.summary, `%${term}%`),
      ilike(codeChunks.content, `%${term}%`),
    ]);
    if (!termFilters.length) return [];
    return this.database.client
      .select({
        id: codeChunks.id,
        content: codeChunks.content,
        summary: codeChunks.summary,
        language: codeChunks.language,
        metadata: codeChunks.metadata,
        filePath: codeFiles.path,
      })
      .from(codeChunks)
      .innerJoin(codeFiles, eq(codeFiles.id, codeChunks.fileId))
      .where(
        and(
          eq(codeChunks.workspaceId, workspaceId),
          eq(codeChunks.repositoryId, repositoryId),
          or(...termFilters),
        ),
      )
      .limit(240);
  }

  async repositoryExists(
    workspaceId: string,
    repositoryId: string,
  ): Promise<boolean> {
    const [repository] = await this.database.client
      .select({ id: repositories.id })
      .from(repositories)
      .where(
        and(
          eq(repositories.workspaceId, workspaceId),
          eq(repositories.id, repositoryId),
        ),
      )
      .limit(1);
    return Boolean(repository);
  }

  embeddingKey(path: string, chunkIndex: number) {
    return `${path}:${chunkIndex}`;
  }
}
