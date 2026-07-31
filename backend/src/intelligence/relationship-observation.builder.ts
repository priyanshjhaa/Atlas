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

export interface RelationshipObservation {
  workspaceId: string;
  observedByRepositoryId: string;
  observedRevision: string;
  sourceRepositoryId: string;
  sourceEntityKind: "file" | "package" | "symbol";
  sourceEntityKey: string;
  targetRepositoryId: string;
  targetEntityKind: "file" | "package" | "symbol";
  targetEntityKey: string;
  kind: string;
  stableKey: string;
  provenance: string;
  confidence: number;
  sourceRevision: string;
  targetRevision: string;
  evidence: Record<string, unknown>;
}

interface BuildInput {
  workspaceId: string;
  repositoryId: string;
  sourceRevision: string;
  localRelationships: ObservedRelationship[];
  packageRelationships: LinkedPackageRelationship[];
  apiRelationships: LinkedApiSymbolRelationship[];
  packages: PersistedCodePackage[];
  symbols: PersistedPublicApiSymbol[];
}

@Injectable()
export class RelationshipObservationBuilder {
  build(input: BuildInput): RelationshipObservation[] {
    const packagesById = new Map(
      input.packages.map((item) => [item.id, item]),
    );
    const symbolsById = new Map(
      input.symbols.map((item) => [item.id, item]),
    );
    const observations = new Map<string, RelationshipObservation>();
    const common = {
      workspaceId: input.workspaceId,
      observedByRepositoryId: input.repositoryId,
      observedRevision: input.sourceRevision,
    };

    for (const relationship of input.localRelationships) {
      const stableKey = `file:${input.repositoryId}:${relationship.stableKey}`;
      observations.set(stableKey, {
        ...common,
        sourceRepositoryId: input.repositoryId,
        sourceEntityKind: "file",
        sourceEntityKey: relationship.sourcePath,
        targetRepositoryId: input.repositoryId,
        targetEntityKind: "file",
        targetEntityKey: relationship.targetPath,
        kind: relationship.kind,
        stableKey,
        provenance: relationship.provenance,
        confidence: relationship.confidence,
        sourceRevision: input.sourceRevision,
        targetRevision: input.sourceRevision,
        evidence: { ...relationship.evidence },
      });
    }

    for (const relationship of input.packageRelationships) {
      if (relationship.workspaceId !== input.workspaceId) continue;
      const sourcePackage = packagesById.get(relationship.sourcePackageId);
      const targetPackage = packagesById.get(relationship.targetPackageId);
      if (
        !sourcePackage ||
        !targetPackage ||
        sourcePackage.workspaceId !== input.workspaceId ||
        targetPackage.workspaceId !== input.workspaceId ||
        sourcePackage.repositoryId !== relationship.sourceRepositoryId ||
        targetPackage.repositoryId !== relationship.targetRepositoryId
      ) {
        continue;
      }
      const stableKey = `package:${relationship.stableKey}`;
      observations.set(stableKey, {
        ...common,
        sourceRepositoryId: relationship.sourceRepositoryId,
        sourceEntityKind: "package",
        sourceEntityKey: `${sourcePackage.name}:${sourcePackage.rootPath || "."}`,
        targetRepositoryId: relationship.targetRepositoryId,
        targetEntityKind: "package",
        targetEntityKey: `${targetPackage.name}:${targetPackage.rootPath || "."}`,
        kind: relationship.kind,
        stableKey,
        provenance: relationship.provenance,
        confidence: relationship.confidence,
        sourceRevision: relationship.sourceRevision,
        targetRevision: targetPackage.sourceRevision,
        evidence: { ...relationship.evidence },
      });
    }

    for (const relationship of input.apiRelationships) {
      if (relationship.workspaceId !== input.workspaceId) continue;
      const target = symbolsById.get(relationship.targetSymbolId);
      if (
        !target?.sourceRevision ||
        target.workspaceId !== input.workspaceId ||
        target.repositoryId !== relationship.targetRepositoryId
      ) {
        continue;
      }
      const stableKey = `symbol:${relationship.stableKey}`;
      observations.set(stableKey, {
        ...common,
        sourceRepositoryId: relationship.sourceRepositoryId,
        sourceEntityKind: relationship.sourceSymbolId ? "symbol" : "file",
        sourceEntityKey: relationship.evidence.sourceSymbolStableKey
          ? relationship.evidence.sourceSymbolStableKey
          : relationship.evidence.sourcePath,
        targetRepositoryId: relationship.targetRepositoryId,
        targetEntityKind: "symbol",
        targetEntityKey: target.stableKey,
        kind: relationship.kind,
        stableKey,
        provenance: relationship.provenance,
        confidence: relationship.confidence,
        sourceRevision: relationship.sourceRevision,
        targetRevision: relationship.targetRevision,
        evidence: { ...relationship.evidence },
      });
    }

    return [...observations.values()];
  }
}
