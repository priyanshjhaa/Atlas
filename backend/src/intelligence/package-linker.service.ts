import { Injectable } from "@nestjs/common";
import type { WorkspacePackageDependency } from "./intelligence.types";

export interface PersistedCodePackage {
  id: string;
  workspaceId: string;
  repositoryId: string;
  name: string;
  rootPath: string;
  sourceRevision: string;
  dependencies: WorkspacePackageDependency[];
}

export interface LinkedPackageRelationship {
  workspaceId: string;
  sourceRepositoryId: string;
  sourcePackageId: string;
  targetRepositoryId: string;
  targetPackageId: string;
  kind: "depends_on";
  stableKey: string;
  provenance: "package_manifest_dependency";
  confidence: number;
  sourceRevision: string;
  evidence: {
    sourcePackageName: string;
    targetPackageName: string;
    dependencyRange: string;
    dependencyKind: WorkspacePackageDependency["kind"];
    scope: "repository" | "cross_repository";
  };
}

export interface PackageLinkResult {
  relationships: LinkedPackageRelationship[];
  ambiguousDependencies: number;
}

@Injectable()
export class PackageLinkerService {
  link(
    packages: PersistedCodePackage[],
    currentRepositoryId: string,
  ): PackageLinkResult {
    const targetsByName = new Map<string, PersistedCodePackage[]>();
    for (const item of packages) {
      targetsByName.set(item.name, [
        ...(targetsByName.get(item.name) ?? []),
        item,
      ]);
    }
    const relationships = new Map<string, LinkedPackageRelationship>();
    let ambiguousDependencies = 0;

    for (const source of packages) {
      for (const dependency of source.dependencies) {
        const targets = (targetsByName.get(dependency.name) ?? []).filter(
          (target) =>
            target.id !== source.id &&
            target.workspaceId === source.workspaceId,
        );
        const touchesCurrentRepository =
          source.repositoryId === currentRepositoryId ||
          targets.some(
            (target) => target.repositoryId === currentRepositoryId,
          );
        if (!touchesCurrentRepository) continue;
        if (targets.length > 1) {
          ambiguousDependencies += 1;
          continue;
        }
        const target = targets[0];
        if (!target) continue;
        const stableKey = [
          source.repositoryId,
          source.name,
          "depends_on",
          target.repositoryId,
          target.name,
        ].join(":");
        relationships.set(stableKey, {
          workspaceId: source.workspaceId,
          sourceRepositoryId: source.repositoryId,
          sourcePackageId: source.id,
          targetRepositoryId: target.repositoryId,
          targetPackageId: target.id,
          kind: "depends_on",
          stableKey,
          provenance: "package_manifest_dependency",
          confidence: 1,
          sourceRevision: source.sourceRevision,
          evidence: {
            sourcePackageName: source.name,
            targetPackageName: target.name,
            dependencyRange: dependency.range,
            dependencyKind: dependency.kind,
            scope:
              source.repositoryId === target.repositoryId
                ? "repository"
                : "cross_repository",
          },
        });
      }
    }

    return {
      relationships: [...relationships.values()],
      ambiguousDependencies,
    };
  }
}
