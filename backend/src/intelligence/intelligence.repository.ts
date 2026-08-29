import { Injectable } from "@nestjs/common";
import { and, desc, eq, ilike, inArray, ne, notInArray, or, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import type {
  GitHubPullRequestProvenance,
  GitHubRepositoryHistory,
} from "../connectors/github-app.service";
import {
  architectureSnapshots,
  codeCalls,
  codeChunks,
  codeFiles,
  codeImports,
  codePackages,
  codeRelationships,
  codeSymbols,
  graphEntities,
  graphRelationships,
  connectors,
  notionDocumentChunks,
  notionDocuments,
  notionResources,
  packageRelationships,
  relationshipObservations,
  repositoryCommits,
  repositoryFileChanges,
  repositoryHistoryRanges,
  repositoryPullRequestReviews,
  repositoryPullRequests,
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
import {
  GraphProjectionBuilder,
  graphEntityReferenceKey,
} from "./graph-projection.builder";
import { PackageLinkerService } from "./package-linker.service";
import { RelationshipObservationBuilder } from "./relationship-observation.builder";
import { boundRepositoryHistory } from "./repository-history";
import { boundPullRequestProvenance } from "./pull-request-provenance";

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
  history: GitHubRepositoryHistory;
}

interface PersistSummary {
  packagesPersisted: number;
  packageRelationshipsPersisted: number;
  ambiguousPackageDependencies: number;
  apiSymbolRelationshipsPersisted: number;
  apiCallRelationshipsPersisted: number;
  ambiguousApiImports: number;
  relationshipObservationsPersisted: number;
  graphEntitiesProjected: number;
  graphRelationshipsProjected: number;
  inferredGraphRelationships: number;
  historyCommitsPersisted: number;
  historyFilesPersisted: number;
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

interface RetrievedGraphChunkRow {
  id: string;
  repositoryId: string;
  content: string;
  summary: string | null;
  metadata: Record<string, unknown>;
  filePath: string;
  graphContext: {
    seedEntityId: string;
    relatedEntityId: string;
    kind: string;
    classification: "observed" | "inferred";
    provenance: string;
    confidence: number;
  };
}

export interface WorkspaceCodeChunkRow extends RetrievedChunkRow {
  repositoryId: string;
  repositoryName: string;
  repositoryOwner: string;
}

export interface WorkspaceNotionChunkRow extends Record<string, unknown> {
  id: string;
  documentId: string;
  resourceId: string;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
  sourceRevision: string;
  title: string;
  url: string | null;
  lastEditedAt: Date | null;
  lastSyncedAt: Date | null;
  distance?: number;
}

@Injectable()
export class IntelligenceRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly packageLinker: PackageLinkerService,
    private readonly apiSymbolLinker: ApiSymbolLinkerService,
    private readonly relationshipObservationBuilder: RelationshipObservationBuilder,
    private readonly graphProjectionBuilder: GraphProjectionBuilder,
  ) {}

  async persist(input: PersistInput): Promise<PersistSummary> {
    return this.database.client.transaction(async (transaction) => {
      const history = boundRepositoryHistory(input.history);
      const historyCommits = history.commits;
      const historyFiles = history.files;
      const persistedCommits = historyCommits.length
        ? await transaction
            .insert(repositoryCommits)
            .values(
              historyCommits.map((commit) => ({
                workspaceId: input.workspaceId,
                repositoryId: input.repositoryId,
                sha: commit.sha,
                message: commit.message.slice(0, 10_000),
                authorName: commit.authorName?.slice(0, 500) ?? null,
                authorLogin: commit.authorLogin?.slice(0, 500) ?? null,
                authoredAt: this.historyDate(commit.authoredAt),
                committedAt: this.historyDate(commit.committedAt),
                parentShas: commit.parentShas.slice(0, 16),
                htmlUrl: commit.htmlUrl.slice(0, 2_000),
              })),
            )
            .onConflictDoUpdate({
              target: [
                repositoryCommits.repositoryId,
                repositoryCommits.sha,
              ],
              set: {
                message: sql`excluded.message`,
                authorName: sql`excluded.author_name`,
                authorLogin: sql`excluded.author_login`,
                authoredAt: sql`excluded.authored_at`,
                committedAt: sql`excluded.committed_at`,
                parentShas: sql`excluded.parent_shas`,
                htmlUrl: sql`excluded.html_url`,
                updatedAt: new Date(),
              },
            })
            .returning({ id: repositoryCommits.id })
        : [];
      const historyStableKey = `${history.baseRevision ?? "initial"}...${history.headRevision}`;
      const [historyRange] = await transaction
        .insert(repositoryHistoryRanges)
        .values({
          workspaceId: input.workspaceId,
          repositoryId: input.repositoryId,
          stableKey: historyStableKey,
          baseRevision: history.baseRevision,
          headRevision: history.headRevision,
          status: history.status.slice(0, 100),
          aheadBy: history.aheadBy,
          behindBy: history.behindBy,
          totalCommits: history.totalCommits,
          commitsCaptured: historyCommits.length,
          filesCaptured: historyFiles.length,
          commitsTruncated: history.commitsTruncated,
          filesTruncated: history.filesTruncated,
        })
        .onConflictDoUpdate({
          target: [
            repositoryHistoryRanges.repositoryId,
            repositoryHistoryRanges.stableKey,
          ],
          set: {
            status: sql`excluded.status`,
            aheadBy: sql`excluded.ahead_by`,
            behindBy: sql`excluded.behind_by`,
            totalCommits: sql`excluded.total_commits`,
            commitsCaptured: sql`excluded.commits_captured`,
            filesCaptured: sql`excluded.files_captured`,
            commitsTruncated: sql`excluded.commits_truncated`,
            filesTruncated: sql`excluded.files_truncated`,
            capturedAt: new Date(),
          },
        })
        .returning({ id: repositoryHistoryRanges.id });
      if (!historyRange) {
        throw new Error("Repository history range was not persisted.");
      }
      await transaction
        .delete(repositoryFileChanges)
        .where(eq(repositoryFileChanges.historyRangeId, historyRange.id));
      const persistedFileChanges = historyFiles.length
        ? await transaction
            .insert(repositoryFileChanges)
            .values(
              historyFiles.map((file) => ({
                workspaceId: input.workspaceId,
                repositoryId: input.repositoryId,
                historyRangeId: historyRange.id,
                path: file.path.slice(0, 4_096),
                previousPath: file.previousPath?.slice(0, 4_096) ?? null,
                status: file.status.slice(0, 100),
                additions: file.additions,
                deletions: file.deletions,
                changes: file.changes,
              })),
            )
            .returning({ id: repositoryFileChanges.id })
        : [];
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

        const symbolIds = new Map<string, string>();
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
          const createdSymbols = await transaction
            .insert(codeSymbols)
            .values(
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
            )
            .returning({
              id: codeSymbols.id,
              stableKey: codeSymbols.stableKey,
            });
          for (const symbol of createdSymbols) {
            symbolIds.set(symbol.stableKey, symbol.id);
          }
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
        if (file.calls.length) {
          const occurrences = new Map<string, number>();
          await transaction.insert(codeCalls).values(
            file.calls.map((call) => {
              const stableBase = [
                file.path,
                call.sourceSymbolStableKey ?? "file",
                call.localName,
                call.memberName ?? "",
              ].join(":");
              const occurrence = (occurrences.get(stableBase) ?? 0) + 1;
              occurrences.set(stableBase, occurrence);
              return {
                workspaceId: input.workspaceId,
                repositoryId: input.repositoryId,
                fileId: createdFile.id,
                sourceSymbolId: call.sourceSymbolStableKey
                  ? symbolIds.get(call.sourceSymbolStableKey)
                  : undefined,
                stableKey:
                  occurrence === 1
                    ? stableBase
                    : `${stableBase}#${occurrence}`,
                localName: call.localName,
                memberName: call.memberName,
                line: call.line,
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
          rootPath: codePackages.rootPath,
          manifestPath: codePackages.manifestPath,
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
      const workspaceCalls = await transaction
        .select({
          id: codeCalls.id,
          workspaceId: codeCalls.workspaceId,
          repositoryId: codeCalls.repositoryId,
          fileId: codeCalls.fileId,
          filePath: codeFiles.path,
          sourceSymbolId: codeCalls.sourceSymbolId,
          sourceSymbolStableKey: codeSymbols.stableKey,
          localName: codeCalls.localName,
          memberName: codeCalls.memberName,
          line: codeCalls.line,
          sourceRevision: codeCalls.sourceRevision,
        })
        .from(codeCalls)
        .innerJoin(codeFiles, eq(codeFiles.id, codeCalls.fileId))
        .leftJoin(codeSymbols, eq(codeSymbols.id, codeCalls.sourceSymbolId))
        .where(eq(codeCalls.workspaceId, input.workspaceId));
      const workspaceFiles = await transaction
        .select({
          repositoryId: codeFiles.repositoryId,
          path: codeFiles.path,
          language: codeFiles.language,
          sourceRevision: codeFiles.sourceRevision,
        })
        .from(codeFiles)
        .where(eq(codeFiles.workspaceId, input.workspaceId));
      const workspaceRepositories = (
        await transaction
          .select({
            id: repositories.id,
            owner: repositories.owner,
            name: repositories.name,
            lastSyncedRevision: repositories.lastSyncedRevision,
          })
          .from(repositories)
          .where(
            and(
              eq(repositories.workspaceId, input.workspaceId),
              eq(repositories.isActive, true),
            ),
          )
      ).flatMap((repository) => {
        const sourceRevision =
          repository.id === input.repositoryId
            ? input.sourceRevision
            : repository.lastSyncedRevision;
        return sourceRevision
          ? [{ ...repository, sourceRevision }]
          : [];
      });
      const apiLinks = this.apiSymbolLinker.link(
        workspaceImports,
        workspaceCalls,
        workspacePackages,
        workspaceSymbols,
        input.repositoryId,
      );
      if (apiLinks.relationships.length) {
        await transaction
          .insert(symbolRelationships)
          .values(apiLinks.relationships);
      }
      const observations = this.relationshipObservationBuilder.build({
        workspaceId: input.workspaceId,
        repositoryId: input.repositoryId,
        sourceRevision: input.sourceRevision,
        localRelationships: input.relationships,
        packageRelationships: linked.relationships,
        apiRelationships: apiLinks.relationships,
        packages: workspacePackages,
        symbols: workspaceSymbols,
      });
      const persistedObservations = observations.length
        ? await transaction
            .insert(relationshipObservations)
            .values(observations)
            .onConflictDoNothing()
            .returning({ id: relationshipObservations.id })
        : [];
      const graph = this.graphProjectionBuilder.build({
        workspaceId: input.workspaceId,
        currentRepositoryId: input.repositoryId,
        repositories: workspaceRepositories,
        files: workspaceFiles,
        packages: workspacePackages,
        symbols: workspaceSymbols,
        localRelationships: input.relationships,
        packageRelationships: linked.relationships,
        apiRelationships: apiLinks.relationships,
      });
      await transaction
        .update(graphEntities)
        .set({ isCurrent: false, updatedAt: new Date() })
        .where(
          and(
            eq(graphEntities.workspaceId, input.workspaceId),
            eq(graphEntities.repositoryId, input.repositoryId),
          ),
        );
      for (let index = 0; index < graph.entities.length; index += 500) {
        await transaction
          .insert(graphEntities)
          .values(graph.entities.slice(index, index + 500))
          .onConflictDoUpdate({
            target: [
              graphEntities.repositoryId,
              graphEntities.entityType,
              graphEntities.stableKey,
            ],
            set: {
              name: sql`excluded.name`,
              path: sql`excluded.path`,
              sourceRevision: sql`excluded.source_revision`,
              metadata: sql`excluded.metadata`,
              isCurrent: true,
              updatedAt: new Date(),
            },
          });
      }
      const persistedGraphEntities = await transaction
        .select({
          id: graphEntities.id,
          repositoryId: graphEntities.repositoryId,
          entityType: graphEntities.entityType,
          stableKey: graphEntities.stableKey,
        })
        .from(graphEntities)
        .where(
          and(
            eq(graphEntities.workspaceId, input.workspaceId),
            eq(graphEntities.isCurrent, true),
          ),
        );
      const graphEntityIds = new Map(
        persistedGraphEntities.map((entity) => [
          graphEntityReferenceKey({
            repositoryId: entity.repositoryId,
            entityType:
              entity.entityType as Parameters<
                typeof graphEntityReferenceKey
              >[0]["entityType"],
            stableKey: entity.stableKey,
          }),
          entity.id,
        ]),
      );
      await transaction
        .update(graphRelationships)
        .set({
          classification: "historical",
          isCurrent: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(graphRelationships.workspaceId, input.workspaceId),
            eq(graphRelationships.isCurrent, true),
            or(
              eq(
                graphRelationships.sourceRepositoryId,
                input.repositoryId,
              ),
              eq(
                graphRelationships.targetRepositoryId,
                input.repositoryId,
              ),
            ),
          ),
        );
      const graphRelationshipValues = graph.relationships.flatMap(
        (relationship) => {
          const sourceEntityId = graphEntityIds.get(
            graphEntityReferenceKey(relationship.source),
          );
          const targetEntityId = graphEntityIds.get(
            graphEntityReferenceKey(relationship.target),
          );
          if (!sourceEntityId || !targetEntityId) return [];
          return [
            {
              workspaceId: relationship.workspaceId,
              sourceRepositoryId: relationship.sourceRepositoryId,
              sourceEntityId,
              targetRepositoryId: relationship.targetRepositoryId,
              targetEntityId,
              kind: relationship.kind,
              stableKey: relationship.stableKey,
              classification: relationship.classification,
              provenance: relationship.provenance,
              confidence: relationship.confidence,
              sourceRevision: relationship.sourceRevision,
              targetRevision: relationship.targetRevision,
              evidence: relationship.evidence,
              isCurrent: true,
            },
          ];
        },
      );
      for (
        let index = 0;
        index < graphRelationshipValues.length;
        index += 500
      ) {
        await transaction
          .insert(graphRelationships)
          .values(graphRelationshipValues.slice(index, index + 500))
          .onConflictDoUpdate({
            target: [
              graphRelationships.workspaceId,
              graphRelationships.stableKey,
            ],
            set: {
              sourceRepositoryId: sql`excluded.source_repository_id`,
              sourceEntityId: sql`excluded.source_entity_id`,
              targetRepositoryId: sql`excluded.target_repository_id`,
              targetEntityId: sql`excluded.target_entity_id`,
              kind: sql`excluded.kind`,
              classification: sql`excluded.classification`,
              provenance: sql`excluded.provenance`,
              confidence: sql`excluded.confidence`,
              sourceRevision: sql`excluded.source_revision`,
              targetRevision: sql`excluded.target_revision`,
              evidence: sql`excluded.evidence`,
              isCurrent: true,
              lastSeenAt: new Date(),
              updatedAt: new Date(),
            },
          });
      }
      return {
        packagesPersisted: input.packages.length,
        packageRelationshipsPersisted: linked.relationships.length,
        ambiguousPackageDependencies: linked.ambiguousDependencies,
        apiSymbolRelationshipsPersisted: apiLinks.relationships.filter(
          (item) => item.kind === "imports_api",
        ).length,
        apiCallRelationshipsPersisted: apiLinks.relationships.filter(
          (item) => item.kind === "calls_api",
        ).length,
        ambiguousApiImports:
          apiLinks.ambiguousPackageImports +
          apiLinks.ambiguousSymbolImports,
        relationshipObservationsPersisted: persistedObservations.length,
        graphEntitiesProjected: graph.entities.length,
        graphRelationshipsProjected: graphRelationshipValues.length,
        inferredGraphRelationships: graphRelationshipValues.filter(
          (item) => item.classification === "inferred",
        ).length,
        historyCommitsPersisted: persistedCommits.length,
        historyFilesPersisted: persistedFileChanges.length,
      };
    });
  }

  async persistRecentPullRequests(input: {
    workspaceId: string;
    repositoryId: string;
    pullRequests: GitHubPullRequestProvenance[];
  }): Promise<{ pullRequestsSynced: number; reviewsSynced: number }> {
    const pullRequests = boundPullRequestProvenance(input.pullRequests);
    return this.database.client.transaction(async (transaction) => {
      const providerIds = pullRequests.map(
        (pullRequest) => pullRequest.providerPullRequestId,
      );
      if (providerIds.length) {
        await transaction
          .delete(repositoryPullRequests)
          .where(
            and(
              eq(repositoryPullRequests.workspaceId, input.workspaceId),
              eq(repositoryPullRequests.repositoryId, input.repositoryId),
              notInArray(
                repositoryPullRequests.providerPullRequestId,
                providerIds,
              ),
            ),
          );
      } else {
        await transaction
          .delete(repositoryPullRequests)
          .where(
            and(
              eq(repositoryPullRequests.workspaceId, input.workspaceId),
              eq(repositoryPullRequests.repositoryId, input.repositoryId),
            ),
          );
      }

      const persisted = pullRequests.length
        ? await transaction
            .insert(repositoryPullRequests)
            .values(
              pullRequests.map((pullRequest) => ({
                workspaceId: input.workspaceId,
                repositoryId: input.repositoryId,
                providerPullRequestId: pullRequest.providerPullRequestId,
                number: pullRequest.number,
                title: pullRequest.title.slice(0, 10_000),
                url: pullRequest.url.slice(0, 2_000),
                state: pullRequest.state.slice(0, 100),
                isDraft: pullRequest.isDraft,
                author: pullRequest.author,
                mergedBy: pullRequest.mergedBy,
                baseRevision: pullRequest.baseRevision,
                headRevision: pullRequest.headRevision,
                reviewsTruncated: pullRequest.reviewsTruncated,
                providerCreatedAt: new Date(pullRequest.providerCreatedAt),
                providerUpdatedAt: new Date(pullRequest.providerUpdatedAt),
                closedAt: pullRequest.closedAt
                  ? new Date(pullRequest.closedAt)
                  : null,
                mergedAt: pullRequest.mergedAt
                  ? new Date(pullRequest.mergedAt)
                  : null,
                lastSyncedAt: new Date(),
              })),
            )
            .onConflictDoUpdate({
              target: [
                repositoryPullRequests.repositoryId,
                repositoryPullRequests.number,
              ],
              set: {
                providerPullRequestId: sql`excluded.provider_pull_request_id`,
                title: sql`excluded.title`,
                url: sql`excluded.url`,
                state: sql`excluded.state`,
                isDraft: sql`excluded.is_draft`,
                author: sql`excluded.author`,
                mergedBy: sql`excluded.merged_by`,
                baseRevision: sql`excluded.base_revision`,
                headRevision: sql`excluded.head_revision`,
                reviewsTruncated: sql`excluded.reviews_truncated`,
                providerCreatedAt: sql`excluded.provider_created_at`,
                providerUpdatedAt: sql`excluded.provider_updated_at`,
                closedAt: sql`excluded.closed_at`,
                mergedAt: sql`excluded.merged_at`,
                lastSyncedAt: new Date(),
                updatedAt: new Date(),
              },
            })
            .returning({
              id: repositoryPullRequests.id,
              providerPullRequestId:
                repositoryPullRequests.providerPullRequestId,
            })
        : [];

      await transaction
        .delete(repositoryPullRequestReviews)
        .where(
          and(
            eq(repositoryPullRequestReviews.workspaceId, input.workspaceId),
            eq(repositoryPullRequestReviews.repositoryId, input.repositoryId),
          ),
        );
      const idByProvider = new Map(
        persisted.map((pullRequest) => [
          pullRequest.providerPullRequestId,
          pullRequest.id,
        ]),
      );
      const reviews = pullRequests.flatMap((pullRequest) => {
        const pullRequestId = idByProvider.get(
          pullRequest.providerPullRequestId,
        );
        if (!pullRequestId) return [];
        return pullRequest.reviews.map((review) => ({
          workspaceId: input.workspaceId,
          repositoryId: input.repositoryId,
          pullRequestId,
          providerReviewId: review.providerReviewId,
          reviewer: review.reviewer,
          state: review.state.slice(0, 100),
          submittedAt: review.submittedAt
            ? new Date(review.submittedAt)
            : null,
          url: review.url.slice(0, 2_000),
        }));
      });
      if (reviews.length) {
        await transaction.insert(repositoryPullRequestReviews).values(reviews);
      }
      return {
        pullRequestsSynced: persisted.length,
        reviewsSynced: reviews.length,
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

  async workspaceVectorCandidates(
    workspaceId: string,
    repositoryId: string | undefined,
    embedding: number[],
  ): Promise<WorkspaceCodeChunkRow[]> {
    const vectorValue = `[${embedding.join(",")}]`;
    const repositoryFilter = repositoryId
      ? sql`and c.repository_id = ${repositoryId}`
      : sql``;
    const result = await this.database.client.execute<WorkspaceCodeChunkRow>(sql`
      select
        c.id,
        c.repository_id as "repositoryId",
        r.name as "repositoryName",
        r.owner as "repositoryOwner",
        c.content,
        c.summary,
        c.language,
        c.metadata,
        f.path as "filePath",
        c.embedding <=> ${vectorValue}::vector as distance
      from ${codeChunks} c
      inner join ${codeFiles} f on f.id = c.file_id
      inner join ${repositories} r on r.id = c.repository_id
      where c.workspace_id = ${workspaceId}
        and r.workspace_id = ${workspaceId}
        and r.is_active = true
        and c.embedding is not null
        ${repositoryFilter}
      order by c.embedding <=> ${vectorValue}::vector
      limit 32
    `);
    return result.rows;
  }

  async workspaceLexicalCandidates(
    workspaceId: string,
    repositoryId: string | undefined,
    terms: string[],
  ): Promise<WorkspaceCodeChunkRow[]> {
    const termFilters = terms.flatMap((term) => [
      ilike(codeFiles.path, `%${term}%`),
      ilike(codeChunks.summary, `%${term}%`),
      ilike(codeChunks.content, `%${term}%`),
    ]);
    if (!termFilters.length) return [];
    return this.database.client
      .select({
        id: codeChunks.id,
        repositoryId: codeChunks.repositoryId,
        repositoryName: repositories.name,
        repositoryOwner: repositories.owner,
        content: codeChunks.content,
        summary: codeChunks.summary,
        language: codeChunks.language,
        metadata: codeChunks.metadata,
        filePath: codeFiles.path,
        distance: sql<number>`1`,
      })
      .from(codeChunks)
      .innerJoin(codeFiles, eq(codeFiles.id, codeChunks.fileId))
      .innerJoin(repositories, eq(repositories.id, codeChunks.repositoryId))
      .where(
        and(
          eq(codeChunks.workspaceId, workspaceId),
          eq(repositories.workspaceId, workspaceId),
          eq(repositories.isActive, true),
          repositoryId
            ? eq(codeChunks.repositoryId, repositoryId)
            : undefined,
          or(...termFilters),
        ),
      )
      .limit(320);
  }

  async notionVectorCandidates(
    workspaceId: string,
    embedding: number[],
    excludeDocumentId?: string,
  ): Promise<WorkspaceNotionChunkRow[]> {
    const vectorValue = `[${embedding.join(",")}]`;
    const result = await this.database.client.execute<WorkspaceNotionChunkRow>(sql`
      select
        c.id,
        c.document_id as "documentId",
        c.resource_id as "resourceId",
        c.content,
        c.token_count as "tokenCount",
        c.metadata,
        c.source_revision as "sourceRevision",
        d.title,
        r.url,
        r.last_edited_at as "lastEditedAt",
        r.last_synced_at as "lastSyncedAt",
        c.embedding <=> ${vectorValue}::vector as distance
      from ${notionDocumentChunks} c
      inner join ${notionDocuments} d on d.id = c.document_id
      inner join ${notionResources} r on r.id = c.resource_id
      inner join ${connectors} connector on connector.id = c.connector_id
      where c.workspace_id = ${workspaceId}
        and d.workspace_id = ${workspaceId}
        and r.workspace_id = ${workspaceId}
        and connector.workspace_id = ${workspaceId}
        and connector.provider = 'notion'
        and connector.status = 'active'
        and r.is_selected = true
        and r.is_active = true
        ${excludeDocumentId ? sql`and c.document_id <> ${excludeDocumentId}` : sql``}
      order by c.embedding <=> ${vectorValue}::vector
      limit 32
    `);
    return result.rows;
  }

  async notionLexicalCandidates(
    workspaceId: string,
    terms: string[],
    excludeDocumentId?: string,
  ): Promise<WorkspaceNotionChunkRow[]> {
    const filters = terms.flatMap((term) => [
      ilike(notionDocuments.title, `%${term}%`),
      ilike(notionDocumentChunks.content, `%${term}%`),
    ]);
    if (!filters.length) return [];
    return this.database.client
      .select({
        id: notionDocumentChunks.id,
        documentId: notionDocumentChunks.documentId,
        resourceId: notionDocumentChunks.resourceId,
        content: notionDocumentChunks.content,
        tokenCount: notionDocumentChunks.tokenCount,
        metadata: notionDocumentChunks.metadata,
        sourceRevision: notionDocumentChunks.sourceRevision,
        title: notionDocuments.title,
        url: notionResources.url,
        lastEditedAt: notionResources.lastEditedAt,
        lastSyncedAt: notionResources.lastSyncedAt,
        distance: sql<number>`1`,
      })
      .from(notionDocumentChunks)
      .innerJoin(
        notionDocuments,
        eq(notionDocuments.id, notionDocumentChunks.documentId),
      )
      .innerJoin(
        notionResources,
        eq(notionResources.id, notionDocumentChunks.resourceId),
      )
      .innerJoin(connectors, eq(connectors.id, notionDocumentChunks.connectorId))
      .where(
        and(
          eq(notionDocumentChunks.workspaceId, workspaceId),
          eq(notionDocuments.workspaceId, workspaceId),
          eq(notionResources.workspaceId, workspaceId),
          eq(connectors.workspaceId, workspaceId),
          eq(connectors.provider, "notion"),
          eq(connectors.status, "active"),
          eq(notionResources.isSelected, true),
          eq(notionResources.isActive, true),
          excludeDocumentId
            ? ne(notionDocumentChunks.documentId, excludeDocumentId)
            : undefined,
          or(...filters),
        ),
      )
      .limit(320);
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

  async graphContextCandidates(
    workspaceId: string,
    repositoryId: string,
    seedPaths: string[],
  ): Promise<RetrievedGraphChunkRow[]> {
    if (!seedPaths.length) return [];
    const seedEntities = await this.database.client
      .select({ id: graphEntities.id })
      .from(graphEntities)
      .where(
        and(
          eq(graphEntities.workspaceId, workspaceId),
          eq(graphEntities.repositoryId, repositoryId),
          eq(graphEntities.isCurrent, true),
          inArray(graphEntities.path, seedPaths),
          or(
            eq(graphEntities.entityType, "file"),
            eq(graphEntities.entityType, "symbol"),
          ),
        ),
      )
      .limit(40);
    const seedEntityIds = seedEntities.map((item) => item.id);
    if (!seedEntityIds.length) return [];
    const edges = await this.database.client
      .select({
        id: graphRelationships.id,
        sourceEntityId: graphRelationships.sourceEntityId,
        targetEntityId: graphRelationships.targetEntityId,
        kind: graphRelationships.kind,
        classification: graphRelationships.classification,
        provenance: graphRelationships.provenance,
        confidence: graphRelationships.confidence,
      })
      .from(graphRelationships)
      .where(
        and(
          eq(graphRelationships.workspaceId, workspaceId),
          eq(graphRelationships.isCurrent, true),
          or(
            eq(graphRelationships.classification, "observed"),
            eq(graphRelationships.classification, "inferred"),
          ),
          or(
            inArray(
              graphRelationships.sourceEntityId,
              seedEntityIds,
            ),
            inArray(
              graphRelationships.targetEntityId,
              seedEntityIds,
            ),
          ),
        ),
      )
      .orderBy(desc(graphRelationships.confidence))
      .limit(200);
    const seedIds = new Set(seedEntityIds);
    const contextByEntityId = new Map<
      string,
      RetrievedGraphChunkRow["graphContext"]
    >();
    for (const edge of edges) {
      const sourceIsSeed = seedIds.has(edge.sourceEntityId);
      const targetIsSeed = seedIds.has(edge.targetEntityId);
      if (sourceIsSeed === targetIsSeed) continue;
      const seedEntityId = sourceIsSeed
        ? edge.sourceEntityId
        : edge.targetEntityId;
      const relatedEntityId = sourceIsSeed
        ? edge.targetEntityId
        : edge.sourceEntityId;
      const candidate = {
        seedEntityId,
        relatedEntityId,
        kind: edge.kind,
        classification: edge.classification as "observed" | "inferred",
        provenance: edge.provenance,
        confidence: edge.confidence,
      };
      const existing = contextByEntityId.get(relatedEntityId);
      const candidateRank =
        (candidate.classification === "observed" ? 2 : 1) +
        candidate.confidence;
      const existingRank = existing
        ? (existing.classification === "observed" ? 2 : 1) +
          existing.confidence
        : -1;
      if (candidateRank > existingRank) {
        contextByEntityId.set(relatedEntityId, candidate);
      }
    }
    const relatedNodes = await this.graphNodes(
      workspaceId,
      [...contextByEntityId.keys()],
    );
    const contextByLocation = new Map<
      string,
      RetrievedGraphChunkRow["graphContext"]
    >();
    for (const node of relatedNodes) {
      if (
        !node.path ||
        (node.entityType !== "file" && node.entityType !== "symbol")
      ) {
        continue;
      }
      const context = contextByEntityId.get(node.id);
      if (!context) continue;
      const key = `${node.repositoryId}\u0000${node.path}`;
      const existing = contextByLocation.get(key);
      if (
        !existing ||
        (context.classification === "observed" &&
          existing.classification === "inferred") ||
        context.confidence > existing.confidence
      ) {
        contextByLocation.set(key, context);
      }
    }
    if (!contextByLocation.size) return [];
    const locationFilters = [...contextByLocation.keys()].map((key) => {
      const [contextRepositoryId, filePath] = key.split("\u0000");
      return and(
        eq(codeChunks.repositoryId, contextRepositoryId),
        eq(codeFiles.path, filePath),
      )!;
    });
    const rows = await this.database.client
      .select({
        id: codeChunks.id,
        repositoryId: codeChunks.repositoryId,
        content: codeChunks.content,
        summary: codeChunks.summary,
        metadata: codeChunks.metadata,
        filePath: codeFiles.path,
      })
      .from(codeChunks)
      .innerJoin(codeFiles, eq(codeFiles.id, codeChunks.fileId))
      .innerJoin(repositories, eq(repositories.id, codeChunks.repositoryId))
      .where(
        and(
          eq(codeChunks.workspaceId, workspaceId),
          eq(repositories.workspaceId, workspaceId),
          eq(repositories.isActive, true),
          or(...locationFilters),
        ),
      )
      .limit(160);
    return rows.flatMap((row) => {
      const graphContext = contextByLocation.get(
        `${row.repositoryId}\u0000${row.filePath}`,
      );
      return graphContext ? [{ ...row, graphContext }] : [];
    });
  }

  async graphSeed(
    workspaceId: string,
    repositoryId: string,
    entityId: string | undefined,
    includeHistorical: boolean,
  ) {
    const [seed] = await this.database.client
      .select({
        id: graphEntities.id,
        repositoryId: graphEntities.repositoryId,
        entityType: graphEntities.entityType,
        stableKey: graphEntities.stableKey,
      })
      .from(graphEntities)
      .where(
        and(
          eq(graphEntities.workspaceId, workspaceId),
          eq(graphEntities.repositoryId, repositoryId),
          entityId
            ? eq(graphEntities.id, entityId)
            : and(
                eq(graphEntities.entityType, "repository"),
                eq(graphEntities.stableKey, "repository"),
              ),
          includeHistorical
            ? undefined
            : eq(graphEntities.isCurrent, true),
        ),
      )
      .limit(1);
    return seed ?? null;
  }

  async graphEdges(
    workspaceId: string,
    frontierEntityIds: string[],
    direction: "incoming" | "outgoing" | "both",
    includeHistorical: boolean,
    includeInferred: boolean,
    limit: number,
  ) {
    if (!frontierEntityIds.length || limit <= 0) return [];
    const currentClassification = includeInferred
      ? or(
          eq(graphRelationships.classification, "observed"),
          eq(graphRelationships.classification, "inferred"),
        )
      : eq(graphRelationships.classification, "observed");
    const classificationFilter = includeHistorical
      ? or(
          and(
            eq(graphRelationships.isCurrent, true),
            currentClassification,
          ),
          eq(graphRelationships.classification, "historical"),
        )
      : and(
          eq(graphRelationships.isCurrent, true),
          currentClassification,
        );
    const directionFilter =
      direction === "incoming"
        ? inArray(
            graphRelationships.targetEntityId,
            frontierEntityIds,
          )
        : direction === "outgoing"
          ? inArray(
              graphRelationships.sourceEntityId,
              frontierEntityIds,
            )
          : or(
              inArray(
                graphRelationships.sourceEntityId,
                frontierEntityIds,
              ),
              inArray(
                graphRelationships.targetEntityId,
                frontierEntityIds,
              ),
            );
    return this.database.client
      .select({
        id: graphRelationships.id,
        sourceEntityId: graphRelationships.sourceEntityId,
        targetEntityId: graphRelationships.targetEntityId,
        kind: graphRelationships.kind,
        classification: graphRelationships.classification,
        provenance: graphRelationships.provenance,
        confidence: graphRelationships.confidence,
        sourceRevision: graphRelationships.sourceRevision,
        targetRevision: graphRelationships.targetRevision,
        evidence: graphRelationships.evidence,
        isCurrent: graphRelationships.isCurrent,
      })
      .from(graphRelationships)
      .where(
        and(
          eq(graphRelationships.workspaceId, workspaceId),
          classificationFilter,
          directionFilter,
        ),
      )
      .orderBy(desc(graphRelationships.confidence), graphRelationships.kind)
      .limit(Math.min(limit, 400));
  }

  async graphNodes(workspaceId: string, entityIds: string[]) {
    if (!entityIds.length) return [];
    return this.database.client
      .select({
        id: graphEntities.id,
        repositoryId: graphEntities.repositoryId,
        repositoryOwner: repositories.owner,
        repositoryName: repositories.name,
        entityType: graphEntities.entityType,
        stableKey: graphEntities.stableKey,
        name: graphEntities.name,
        path: graphEntities.path,
        sourceRevision: graphEntities.sourceRevision,
        metadata: graphEntities.metadata,
        isCurrent: graphEntities.isCurrent,
      })
      .from(graphEntities)
      .innerJoin(repositories, eq(repositories.id, graphEntities.repositoryId))
      .where(
        and(
          eq(graphEntities.workspaceId, workspaceId),
          inArray(graphEntities.id, entityIds),
          eq(repositories.workspaceId, workspaceId),
          eq(repositories.isActive, true),
        ),
      )
      .orderBy(graphEntities.entityType, graphEntities.name)
      .then((nodes) =>
        nodes.map((node) => ({
          id: node.id,
          repositoryId: node.repositoryId,
          repository: `${node.repositoryOwner}/${node.repositoryName}`,
          entityType: node.entityType,
          stableKey: node.stableKey,
          name: node.name,
          path: node.path,
          sourceRevision: node.sourceRevision,
          metadata: node.metadata,
          isCurrent: node.isCurrent,
        })),
      );
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
          eq(repositories.isActive, true),
        ),
      )
      .limit(1);
    return Boolean(repository);
  }

  embeddingKey(path: string, chunkIndex: number) {
    return `${path}:${chunkIndex}`;
  }

  private historyDate(value: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
