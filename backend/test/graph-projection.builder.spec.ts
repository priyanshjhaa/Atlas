import { describe, expect, it } from "vitest";
import type {
  LinkedApiSymbolRelationship,
  PersistedPublicApiSymbol,
} from "../src/intelligence/api-symbol-linker.service";
import {
  GraphProjectionBuilder,
  graphEntityReferenceKey,
} from "../src/intelligence/graph-projection.builder";
import type {
  LinkedPackageRelationship,
  PersistedCodePackage,
} from "../src/intelligence/package-linker.service";
import type { ObservedRelationship } from "../src/intelligence/intelligence.types";

const corePackage: PersistedCodePackage = {
  id: "package-core",
  workspaceId: "workspace-1",
  repositoryId: "repository-core",
  name: "@atlas/core",
  rootPath: "",
  manifestPath: "package.json",
  sourceRevision: "core-revision",
  dependencies: [],
};
const webPackage: PersistedCodePackage = {
  id: "package-web",
  workspaceId: "workspace-1",
  repositoryId: "repository-web",
  name: "@atlas/web",
  rootPath: "",
  manifestPath: "package.json",
  sourceRevision: "web-revision",
  dependencies: [],
};
const refreshSymbol: PersistedPublicApiSymbol = {
  id: "symbol-refresh",
  workspaceId: "workspace-1",
  repositoryId: "repository-core",
  packageId: "package-core",
  filePath: "src/session.ts",
  stableKey: "src/session.ts:function:refreshSession",
  name: "refreshSession",
  exportNames: ["refreshSession"],
  apiSpecifiers: ["@atlas/core"],
  publicApi: true,
  sourceRevision: "core-revision",
};
const handlerSymbol: PersistedPublicApiSymbol = {
  id: "symbol-handler",
  workspaceId: "workspace-1",
  repositoryId: "repository-core",
  packageId: "package-core",
  filePath: "src/api.ts",
  stableKey: "src/api.ts:function:handler",
  name: "handler",
  exportNames: ["handler"],
  apiSpecifiers: [],
  publicApi: false,
  sourceRevision: "core-revision",
};
const localRelationship: ObservedRelationship = {
  sourcePath: "src/api.ts",
  targetPath: "src/session.ts",
  kind: "imports",
  stableKey: "src/api.ts:imports:src/session.ts",
  provenance: "typescript_static_import",
  confidence: 1,
  evidence: {
    sourcePath: "src/api.ts",
    targetPath: "src/session.ts",
    importSpecifier: "./session",
    line: 2,
    resolvedBy: "typescript_type_checker",
    resolutionKind: "relative",
    importedSymbols: [
      {
        localName: "refresh",
        exportedName: "refreshSession",
        targetName: "refreshSession",
        targetKind: "function",
        targetPath: "src/session.ts",
      },
    ],
  },
};
const packageRelationship: LinkedPackageRelationship = {
  workspaceId: "workspace-1",
  sourceRepositoryId: "repository-web",
  sourcePackageId: "package-web",
  targetRepositoryId: "repository-core",
  targetPackageId: "package-core",
  kind: "depends_on",
  stableKey:
    "repository-web:@atlas/web:depends_on:repository-core:@atlas/core",
  provenance: "package_manifest_dependency",
  confidence: 1,
  sourceRevision: "web-revision",
  evidence: {
    sourcePackageName: "@atlas/web",
    targetPackageName: "@atlas/core",
    dependencyRange: "^1.0.0",
    dependencyKind: "runtime",
    scope: "cross_repository",
  },
};
const apiRelationship: LinkedApiSymbolRelationship = {
  workspaceId: "workspace-1",
  sourceRepositoryId: "repository-web",
  sourceFileId: "file-web-client",
  sourceSymbolId: null,
  targetRepositoryId: "repository-core",
  targetSymbolId: "symbol-refresh",
  kind: "calls_api",
  stableKey:
    "repository-web:src/client.ts:calls_api:repository-core:refreshSession",
  provenance: "typescript_public_api_call",
  confidence: 1,
  sourceRevision: "web-revision",
  targetRevision: "core-revision",
  evidence: {
    sourcePath: "src/client.ts",
    targetPath: "src/session.ts",
    packageName: "@atlas/core",
    importSpecifier: "@atlas/core",
    importedName: "refreshSession",
    localName: "refreshSession",
    typeOnly: false,
    lines: [7],
    scope: "cross_repository",
  },
};

describe("GraphProjectionBuilder", () => {
  it("projects stable graph entities and keeps inferred bindings distinct", () => {
    const graph = new GraphProjectionBuilder().build({
      workspaceId: "workspace-1",
      currentRepositoryId: "repository-core",
      repositories: [
        {
          id: "repository-core",
          owner: "atlas",
          name: "core",
          sourceRevision: "core-revision",
        },
        {
          id: "repository-web",
          owner: "atlas",
          name: "web",
          sourceRevision: "web-revision",
        },
      ],
      files: [
        {
          repositoryId: "repository-core",
          path: "src/api.ts",
          language: "typescript",
          sourceRevision: "core-revision",
        },
        {
          repositoryId: "repository-core",
          path: "src/session.ts",
          language: "typescript",
          sourceRevision: "core-revision",
        },
        {
          repositoryId: "repository-web",
          path: "src/client.ts",
          language: "typescript",
          sourceRevision: "web-revision",
        },
      ],
      packages: [corePackage, webPackage],
      symbols: [refreshSymbol, handlerSymbol],
      localRelationships: [localRelationship],
      packageRelationships: [packageRelationship],
      apiRelationships: [apiRelationship],
    });

    expect(
      new Set(graph.entities.map((item) => item.entityType)),
    ).toEqual(new Set(["repository", "package", "file", "symbol"]));
    expect(
      graph.entities.map((item) => graphEntityReferenceKey(item)),
    ).toContain(
      graphEntityReferenceKey({
        repositoryId: "repository-core",
        entityType: "symbol",
        stableKey: "src/session.ts:function:refreshSession",
      }),
    );
    expect(graph.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "imports",
          classification: "observed",
          provenance: "typescript_static_import",
          confidence: 1,
        }),
        expect.objectContaining({
          kind: "depends_on",
          classification: "observed",
          provenance: "package_manifest_dependency",
        }),
        expect.objectContaining({
          kind: "calls_api",
          classification: "observed",
          provenance: "typescript_public_api_call",
        }),
        expect.objectContaining({
          kind: "references_symbol",
          classification: "inferred",
          provenance: "typescript_import_binding_inference",
          confidence: 0.7,
          source: {
            repositoryId: "repository-core",
            entityType: "file",
            stableKey: "src/api.ts",
          },
          target: {
            repositoryId: "repository-core",
            entityType: "symbol",
            stableKey: "src/session.ts:function:refreshSession",
          },
        }),
      ]),
    );
    expect(
      graph.relationships.filter(
        (item) => item.classification === "inferred",
      ),
    ).toHaveLength(1);
  });

  it("does not project endpoints from repositories outside the active workspace set", () => {
    const graph = new GraphProjectionBuilder().build({
      workspaceId: "workspace-1",
      currentRepositoryId: "repository-core",
      repositories: [
        {
          id: "repository-core",
          owner: "atlas",
          name: "core",
          sourceRevision: "core-revision",
        },
      ],
      files: [
        {
          repositoryId: "repository-core",
          path: "src/session.ts",
          language: "typescript",
          sourceRevision: "core-revision",
        },
      ],
      packages: [corePackage, webPackage],
      symbols: [refreshSymbol],
      localRelationships: [],
      packageRelationships: [packageRelationship],
      apiRelationships: [apiRelationship],
    });

    expect(
      graph.entities.some(
        (item) => item.repositoryId === "repository-web",
      ),
    ).toBe(false);
    expect(
      graph.relationships.some(
        (item) =>
          item.sourceRepositoryId === "repository-web" ||
          item.targetRepositoryId === "repository-web",
      ),
    ).toBe(false);
  });
});
