import { Injectable } from "@nestjs/common";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import {
  architectureSnapshots,
  codeChunks,
  codeFiles,
  codePackages,
  codeRelationships,
  codeSymbols,
  packageRelationships,
  repositories,
} from "../database/schema";
import type {
  ArchitectureSnapshotData,
  ObservedRelationship,
  ParsedFile,
  WorkspacePackage,
} from "./intelligence.types";
import { PackageLinkerService } from "./package-linker.service";

interface PersistInput {
  workspaceId: string;
  repositoryId: string;
  sourceRevision: string;
  files: ParsedFile[];
  relationships: ObservedRelationship[];
  packages: WorkspacePackage[];
  embeddings: Map<string, number[]>;
  architecture: ArchitectureSnapshotData;
}

interface PersistSummary {
  packagesPersisted: number;
  packageRelationshipsPersisted: number;
  ambiguousPackageDependencies: number;
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
  ) {}

  async persist(input: PersistInput): Promise<PersistSummary> {
    return this.database.client.transaction(async (transaction) => {
      await transaction
        .delete(codeFiles)
        .where(eq(codeFiles.repositoryId, input.repositoryId));
      await transaction
        .delete(codePackages)
        .where(eq(codePackages.repositoryId, input.repositoryId));

      for (const item of input.packages) {
        await transaction.insert(codePackages).values({
          workspaceId: input.workspaceId,
          repositoryId: input.repositoryId,
          stableKey: `${item.name}:${item.rootPath || "."}`,
          name: item.name,
          version: item.version,
          rootPath: item.rootPath,
          manifestPath: item.manifestPath,
          entryPoints: item.entryPoints,
          dependencies: item.dependencies,
          sourceRevision: input.sourceRevision,
        });
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
          await transaction.insert(codeSymbols).values(
            file.symbols.map((symbol) => ({
              workspaceId: input.workspaceId,
              repositoryId: input.repositoryId,
              fileId: createdFile.id,
              stableKey: symbol.stableKey,
              name: symbol.name,
              kind: symbol.kind,
              lineStart: symbol.lineStart,
              lineEnd: symbol.lineEnd,
              exported: symbol.exported,
              metadata: symbol.metadata,
            })),
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
      return {
        packagesPersisted: input.packages.length,
        packageRelationshipsPersisted: linked.relationships.length,
        ambiguousPackageDependencies: linked.ambiguousDependencies,
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
