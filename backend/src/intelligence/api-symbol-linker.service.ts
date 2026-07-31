import { Injectable } from "@nestjs/common";
import type { ParsedImportBinding } from "./intelligence.types";

export interface PersistedCodeImport {
  id: string;
  workspaceId: string;
  repositoryId: string;
  fileId: string;
  filePath: string;
  specifier: string;
  line: number;
  bindings: ParsedImportBinding[];
  sourceRevision: string;
}

export interface PersistedApiPackage {
  id: string;
  workspaceId: string;
  repositoryId: string;
  name: string;
  entryPoints: string[];
  exportMappings: Record<string, string[]>;
}

export interface PersistedPublicApiSymbol {
  id: string;
  workspaceId: string;
  repositoryId: string;
  packageId: string | null;
  filePath: string;
  stableKey: string;
  name: string;
  exportNames: string[];
  apiSpecifiers: string[];
  publicApi: boolean;
  sourceRevision: string | null;
}

export interface LinkedApiSymbolRelationship {
  workspaceId: string;
  sourceRepositoryId: string;
  sourceFileId: string;
  targetRepositoryId: string;
  targetSymbolId: string;
  kind: "imports_api";
  stableKey: string;
  provenance: "typescript_public_api_import";
  confidence: number;
  sourceRevision: string;
  targetRevision: string;
  evidence: {
    sourcePath: string;
    targetPath: string;
    packageName: string;
    importSpecifier: string;
    importedName: string;
    localName: string;
    typeOnly: boolean;
    line: number;
    scope: "repository" | "cross_repository";
  };
}

export interface ApiSymbolLinkResult {
  relationships: LinkedApiSymbolRelationship[];
  ambiguousPackageImports: number;
  ambiguousSymbolImports: number;
}

function exportedPaths(
  packageItem: PersistedApiPackage,
  specifier: string,
) {
  const exact = packageItem.exportMappings[specifier];
  if (exact?.length) return exact;
  const matches: string[] = [];
  for (const [pattern, targets] of Object.entries(
    packageItem.exportMappings,
  )) {
    const wildcard = pattern.indexOf("*");
    if (wildcard < 0) continue;
    const prefix = pattern.slice(0, wildcard);
    const suffix = pattern.slice(wildcard + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
      continue;
    }
    const matched = specifier.slice(
      prefix.length,
      specifier.length - suffix.length,
    );
    matches.push(...targets.map((target) => target.replace("*", matched)));
  }
  if (matches.length) return [...new Set(matches)];
  return specifier === packageItem.name ? packageItem.entryPoints : [];
}

function matchesApiSpecifier(pattern: string, specifier: string) {
  const wildcard = pattern.indexOf("*");
  if (wildcard < 0) return pattern === specifier;
  return (
    specifier.startsWith(pattern.slice(0, wildcard)) &&
    specifier.endsWith(pattern.slice(wildcard + 1))
  );
}

@Injectable()
export class ApiSymbolLinkerService {
  link(
    imports: PersistedCodeImport[],
    packages: PersistedApiPackage[],
    symbols: PersistedPublicApiSymbol[],
    currentRepositoryId: string,
  ): ApiSymbolLinkResult {
    const packageNames = [...new Set(packages.map((item) => item.name))].sort(
      (left, right) => right.length - left.length,
    );
    const packagesByName = new Map<string, PersistedApiPackage[]>();
    for (const item of packages) {
      packagesByName.set(item.name, [
        ...(packagesByName.get(item.name) ?? []),
        item,
      ]);
    }
    const symbolsByPackage = new Map<string, PersistedPublicApiSymbol[]>();
    for (const symbol of symbols) {
      if (!symbol.packageId || !symbol.publicApi) continue;
      symbolsByPackage.set(symbol.packageId, [
        ...(symbolsByPackage.get(symbol.packageId) ?? []),
        symbol,
      ]);
    }
    const relationships = new Map<string, LinkedApiSymbolRelationship>();
    let ambiguousPackageImports = 0;
    let ambiguousSymbolImports = 0;

    for (const imported of imports) {
      if (imported.specifier.startsWith(".")) continue;
      const packageName = packageNames.find(
        (name) =>
          imported.specifier === name ||
          imported.specifier.startsWith(`${name}/`),
      );
      if (!packageName) continue;
      const packageCandidates = (
        packagesByName.get(packageName) ?? []
      ).filter((item) => item.workspaceId === imported.workspaceId);
      if (packageCandidates.length > 1) {
        ambiguousPackageImports += 1;
        continue;
      }
      const targetPackage = packageCandidates[0];
      if (!targetPackage) continue;
      const targetPaths = new Set(exportedPaths(targetPackage, imported.specifier));

      for (const binding of imported.bindings) {
        if (binding.kind === "namespace") continue;
        const symbolCandidates = (
          symbolsByPackage.get(targetPackage.id) ?? []
        ).filter(
          (symbol) =>
            symbol.workspaceId === imported.workspaceId &&
            symbol.exportNames.includes(binding.importedName) &&
            (symbol.apiSpecifiers.some((pattern) =>
              matchesApiSpecifier(pattern, imported.specifier),
            ) ||
              (!symbol.apiSpecifiers.length &&
                (!targetPaths.size || targetPaths.has(symbol.filePath)))),
        );
        if (symbolCandidates.length > 1) {
          ambiguousSymbolImports += 1;
          continue;
        }
        const target = symbolCandidates[0];
        if (!target?.sourceRevision) continue;
        const touchesCurrentRepository =
          imported.repositoryId === currentRepositoryId ||
          target.repositoryId === currentRepositoryId;
        if (!touchesCurrentRepository) continue;
        const stableKey = [
          imported.repositoryId,
          imported.filePath,
          "imports_api",
          imported.specifier,
          binding.importedName,
          target.repositoryId,
          target.stableKey,
        ].join(":");
        relationships.set(stableKey, {
          workspaceId: imported.workspaceId,
          sourceRepositoryId: imported.repositoryId,
          sourceFileId: imported.fileId,
          targetRepositoryId: target.repositoryId,
          targetSymbolId: target.id,
          kind: "imports_api",
          stableKey,
          provenance: "typescript_public_api_import",
          confidence: 1,
          sourceRevision: imported.sourceRevision,
          targetRevision: target.sourceRevision,
          evidence: {
            sourcePath: imported.filePath,
            targetPath: target.filePath,
            packageName,
            importSpecifier: imported.specifier,
            importedName: binding.importedName,
            localName: binding.localName,
            typeOnly: binding.typeOnly,
            line: imported.line,
            scope:
              imported.repositoryId === target.repositoryId
                ? "repository"
                : "cross_repository",
          },
        });
      }
    }

    return {
      relationships: [...relationships.values()],
      ambiguousPackageImports,
      ambiguousSymbolImports,
    };
  }
}
