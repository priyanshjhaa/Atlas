import { Injectable } from "@nestjs/common";
import type {
  LinkedApiSymbolRelationship,
  PersistedPublicApiSymbol,
} from "./api-symbol-linker.service";
import type {
  LinkedPackageRelationship,
  PersistedCodePackage,
} from "./package-linker.service";
import type { ObservedRelationship } from "./intelligence.types";

export type GraphEntityType = "repository" | "package" | "file" | "symbol";
export type GraphRelationshipClassification =
  | "observed"
  | "historical"
  | "inferred";

export interface GraphRepositoryInput {
  id: string;
  owner: string;
  name: string;
  sourceRevision: string;
}

export interface GraphFileInput {
  repositoryId: string;
  path: string;
  language: string;
  sourceRevision: string;
}

export interface GraphEntityProjection {
  workspaceId: string;
  repositoryId: string;
  entityType: GraphEntityType;
  stableKey: string;
  name: string;
  path: string | null;
  sourceRevision: string;
  metadata: Record<string, unknown>;
  isCurrent: true;
}

export interface GraphEntityReference {
  repositoryId: string;
  entityType: GraphEntityType;
  stableKey: string;
}

export interface GraphRelationshipProjection {
  workspaceId: string;
  sourceRepositoryId: string;
  source: GraphEntityReference;
  targetRepositoryId: string;
  target: GraphEntityReference;
  kind: string;
  stableKey: string;
  classification: "observed" | "inferred";
  provenance: string;
  confidence: number;
  sourceRevision: string;
  targetRevision: string;
  evidence: Record<string, unknown>;
}

interface BuildInput {
  workspaceId: string;
  currentRepositoryId: string;
  repositories: GraphRepositoryInput[];
  files: GraphFileInput[];
  packages: PersistedCodePackage[];
  symbols: PersistedPublicApiSymbol[];
  localRelationships: ObservedRelationship[];
  packageRelationships: LinkedPackageRelationship[];
  apiRelationships: LinkedApiSymbolRelationship[];
}

export function graphEntityReferenceKey(
  reference: GraphEntityReference,
): string {
  return [
    reference.repositoryId,
    reference.entityType,
    reference.stableKey,
  ].join("\u0000");
}

@Injectable()
export class GraphProjectionBuilder {
  build(input: BuildInput): {
    entities: GraphEntityProjection[];
    relationships: GraphRelationshipProjection[];
  } {
    const activeRepositoryIds = new Set(
      input.repositories.map((item) => item.id),
    );
    const repositoriesById = new Map(
      input.repositories.map((item) => [item.id, item]),
    );
    const files = input.files.filter((item) =>
      activeRepositoryIds.has(item.repositoryId),
    );
    const packages = input.packages.filter((item) =>
      activeRepositoryIds.has(item.repositoryId),
    );
    const symbols = input.symbols.filter((item) =>
      activeRepositoryIds.has(item.repositoryId),
    );
    const entities = new Map<string, GraphEntityProjection>();
    const relationships = new Map<string, GraphRelationshipProjection>();
    const addEntity = (entity: GraphEntityProjection) => {
      entities.set(graphEntityReferenceKey(entity), entity);
    };
    const addRelationship = (relationship: GraphRelationshipProjection) => {
      if (
        !entities.has(graphEntityReferenceKey(relationship.source)) ||
        !entities.has(graphEntityReferenceKey(relationship.target))
      ) {
        return;
      }
      relationships.set(relationship.stableKey, relationship);
    };

    for (const repository of input.repositories) {
      addEntity({
        workspaceId: input.workspaceId,
        repositoryId: repository.id,
        entityType: "repository",
        stableKey: "repository",
        name: `${repository.owner}/${repository.name}`,
        path: null,
        sourceRevision: repository.sourceRevision,
        metadata: {
          owner: repository.owner,
          repository: repository.name,
        },
        isCurrent: true,
      });
    }
    for (const file of files) {
      addEntity({
        workspaceId: input.workspaceId,
        repositoryId: file.repositoryId,
        entityType: "file",
        stableKey: file.path,
        name: file.path.split("/").at(-1) ?? file.path,
        path: file.path,
        sourceRevision: file.sourceRevision,
        metadata: { language: file.language },
        isCurrent: true,
      });
    }
    for (const item of packages) {
      addEntity({
        workspaceId: input.workspaceId,
        repositoryId: item.repositoryId,
        entityType: "package",
        stableKey: `${item.name}:${item.rootPath || "."}`,
        name: item.name,
        path: item.rootPath || null,
        sourceRevision: item.sourceRevision,
        metadata: {
          manifestPath: item.manifestPath,
          rootPath: item.rootPath,
        },
        isCurrent: true,
      });
    }
    for (const symbol of symbols) {
      if (!symbol.sourceRevision) continue;
      addEntity({
        workspaceId: input.workspaceId,
        repositoryId: symbol.repositoryId,
        entityType: "symbol",
        stableKey: symbol.stableKey,
        name: symbol.name,
        path: symbol.filePath,
        sourceRevision: symbol.sourceRevision,
        metadata: {
          publicApi: symbol.publicApi,
          exportNames: symbol.exportNames,
          apiSpecifiers: symbol.apiSpecifiers,
        },
        isCurrent: true,
      });
    }

    const currentRepository = repositoriesById.get(
      input.currentRepositoryId,
    );
    if (!currentRepository) {
      return {
        entities: [...entities.values()],
        relationships: [],
      };
    }
    const repositoryReference: GraphEntityReference = {
      repositoryId: currentRepository.id,
      entityType: "repository",
      stableKey: "repository",
    };
    for (const file of files.filter(
      (item) => item.repositoryId === input.currentRepositoryId,
    )) {
      addRelationship({
        workspaceId: input.workspaceId,
        sourceRepositoryId: input.currentRepositoryId,
        source: repositoryReference,
        targetRepositoryId: input.currentRepositoryId,
        target: {
          repositoryId: input.currentRepositoryId,
          entityType: "file",
          stableKey: file.path,
        },
        kind: "contains",
        stableKey: `hierarchy:${input.currentRepositoryId}:repository:contains:file:${file.path}`,
        classification: "observed",
        provenance: "repository_index_membership",
        confidence: 1,
        sourceRevision: currentRepository.sourceRevision,
        targetRevision: file.sourceRevision,
        evidence: { path: file.path, language: file.language },
      });
    }
    for (const item of packages.filter(
      (item) => item.repositoryId === input.currentRepositoryId,
    )) {
      addRelationship({
        workspaceId: input.workspaceId,
        sourceRepositoryId: input.currentRepositoryId,
        source: repositoryReference,
        targetRepositoryId: input.currentRepositoryId,
        target: {
          repositoryId: input.currentRepositoryId,
          entityType: "package",
          stableKey: `${item.name}:${item.rootPath || "."}`,
        },
        kind: "contains",
        stableKey: `hierarchy:${input.currentRepositoryId}:repository:contains:package:${item.name}:${item.rootPath || "."}`,
        classification: "observed",
        provenance: "package_manifest_membership",
        confidence: 1,
        sourceRevision: currentRepository.sourceRevision,
        targetRevision: item.sourceRevision,
        evidence: {
          packageName: item.name,
          manifestPath: item.manifestPath,
        },
      });
    }
    for (const symbol of symbols.filter(
      (item) => item.repositoryId === input.currentRepositoryId,
    )) {
      if (!symbol.sourceRevision) continue;
      addRelationship({
        workspaceId: input.workspaceId,
        sourceRepositoryId: input.currentRepositoryId,
        source: {
          repositoryId: input.currentRepositoryId,
          entityType: "file",
          stableKey: symbol.filePath,
        },
        targetRepositoryId: input.currentRepositoryId,
        target: {
          repositoryId: input.currentRepositoryId,
          entityType: "symbol",
          stableKey: symbol.stableKey,
        },
        kind: "declares",
        stableKey: `hierarchy:${input.currentRepositoryId}:file:${symbol.filePath}:declares:${symbol.stableKey}`,
        classification: "observed",
        provenance: "typescript_symbol_declaration",
        confidence: 1,
        sourceRevision: symbol.sourceRevision,
        targetRevision: symbol.sourceRevision,
        evidence: {
          filePath: symbol.filePath,
          symbol: symbol.name,
        },
      });
    }

    for (const relationship of input.localRelationships) {
      addRelationship({
        workspaceId: input.workspaceId,
        sourceRepositoryId: input.currentRepositoryId,
        source: {
          repositoryId: input.currentRepositoryId,
          entityType: "file",
          stableKey: relationship.sourcePath,
        },
        targetRepositoryId: input.currentRepositoryId,
        target: {
          repositoryId: input.currentRepositoryId,
          entityType: "file",
          stableKey: relationship.targetPath,
        },
        kind: relationship.kind,
        stableKey: `observed:file:${input.currentRepositoryId}:${relationship.stableKey}`,
        classification: "observed",
        provenance: relationship.provenance,
        confidence: relationship.confidence,
        sourceRevision: currentRepository.sourceRevision,
        targetRevision: currentRepository.sourceRevision,
        evidence: { ...relationship.evidence },
      });

      for (const imported of relationship.evidence.importedSymbols ?? []) {
        const candidates = symbols.filter(
          (symbol) =>
            symbol.repositoryId === input.currentRepositoryId &&
            symbol.filePath === imported.targetPath &&
            symbol.name === imported.targetName &&
            Boolean(symbol.sourceRevision),
        );
        if (candidates.length !== 1) continue;
        const target = candidates[0];
        if (!target?.sourceRevision) continue;
        const stableKey = [
          "inferred",
          "binding",
          input.currentRepositoryId,
          relationship.sourcePath,
          imported.localName,
          target.stableKey,
        ].join(":");
        addRelationship({
          workspaceId: input.workspaceId,
          sourceRepositoryId: input.currentRepositoryId,
          source: {
            repositoryId: input.currentRepositoryId,
            entityType: "file",
            stableKey: relationship.sourcePath,
          },
          targetRepositoryId: input.currentRepositoryId,
          target: {
            repositoryId: input.currentRepositoryId,
            entityType: "symbol",
            stableKey: target.stableKey,
          },
          kind: "references_symbol",
          stableKey,
          classification: "inferred",
          provenance: "typescript_import_binding_inference",
          confidence: 0.7,
          sourceRevision: currentRepository.sourceRevision,
          targetRevision: target.sourceRevision,
          evidence: {
            sourcePath: relationship.sourcePath,
            targetPath: imported.targetPath,
            targetSymbol: imported.targetName,
            importedName: imported.exportedName,
            localName: imported.localName,
            importLine: relationship.evidence.line,
            observedFileRelationship: relationship.stableKey,
          },
        });
      }
    }

    const packagesById = new Map(packages.map((item) => [item.id, item]));
    for (const relationship of input.packageRelationships) {
      const source = packagesById.get(relationship.sourcePackageId);
      const target = packagesById.get(relationship.targetPackageId);
      if (!source || !target) continue;
      addRelationship({
        workspaceId: input.workspaceId,
        sourceRepositoryId: relationship.sourceRepositoryId,
        source: {
          repositoryId: relationship.sourceRepositoryId,
          entityType: "package",
          stableKey: `${source.name}:${source.rootPath || "."}`,
        },
        targetRepositoryId: relationship.targetRepositoryId,
        target: {
          repositoryId: relationship.targetRepositoryId,
          entityType: "package",
          stableKey: `${target.name}:${target.rootPath || "."}`,
        },
        kind: relationship.kind,
        stableKey: `observed:package:${relationship.stableKey}`,
        classification: "observed",
        provenance: relationship.provenance,
        confidence: relationship.confidence,
        sourceRevision: relationship.sourceRevision,
        targetRevision: target.sourceRevision,
        evidence: { ...relationship.evidence },
      });
    }

    const symbolsById = new Map(symbols.map((item) => [item.id, item]));
    for (const relationship of input.apiRelationships) {
      const target = symbolsById.get(relationship.targetSymbolId);
      const sourceSymbol = relationship.sourceSymbolId
        ? symbolsById.get(relationship.sourceSymbolId)
        : undefined;
      if (!target?.sourceRevision) continue;
      addRelationship({
        workspaceId: input.workspaceId,
        sourceRepositoryId: relationship.sourceRepositoryId,
        source: sourceSymbol
          ? {
              repositoryId: relationship.sourceRepositoryId,
              entityType: "symbol",
              stableKey: sourceSymbol.stableKey,
            }
          : {
              repositoryId: relationship.sourceRepositoryId,
              entityType: "file",
              stableKey: relationship.evidence.sourcePath,
            },
        targetRepositoryId: relationship.targetRepositoryId,
        target: {
          repositoryId: relationship.targetRepositoryId,
          entityType: "symbol",
          stableKey: target.stableKey,
        },
        kind: relationship.kind,
        stableKey: `observed:symbol:${relationship.stableKey}`,
        classification: "observed",
        provenance: relationship.provenance,
        confidence: relationship.confidence,
        sourceRevision: relationship.sourceRevision,
        targetRevision: relationship.targetRevision,
        evidence: { ...relationship.evidence },
      });
    }

    return {
      entities: [...entities.values()],
      relationships: [...relationships.values()],
    };
  }
}
