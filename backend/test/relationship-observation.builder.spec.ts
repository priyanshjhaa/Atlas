import { describe, expect, it } from "vitest";
import type {
  LinkedApiSymbolRelationship,
  PersistedPublicApiSymbol,
} from "../src/intelligence/api-symbol-linker.service";
import type {
  LinkedPackageRelationship,
  PersistedCodePackage,
} from "../src/intelligence/package-linker.service";
import { RelationshipObservationBuilder } from "../src/intelligence/relationship-observation.builder";
import type { ObservedRelationship } from "../src/intelligence/intelligence.types";

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
    line: 3,
    resolvedBy: "typescript_type_checker",
    resolutionKind: "relative",
  },
};

const packages: PersistedCodePackage[] = [
  {
    id: "package-web",
    workspaceId: "workspace-1",
    repositoryId: "repository-web",
    name: "@atlas/web",
    rootPath: "apps/web",
    sourceRevision: "web-revision",
    dependencies: [],
  },
  {
    id: "package-core",
    workspaceId: "workspace-1",
    repositoryId: "repository-core",
    name: "@atlas/core",
    rootPath: "packages/core",
    sourceRevision: "core-revision",
    dependencies: [],
  },
];

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
    dependencyRange: "workspace:*",
    dependencyKind: "runtime",
    scope: "cross_repository",
  },
};

const targetSymbol: PersistedPublicApiSymbol = {
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

function apiRelationship(
  kind: LinkedApiSymbolRelationship["kind"],
): LinkedApiSymbolRelationship {
  return {
    workspaceId: "workspace-1",
    sourceRepositoryId: "repository-web",
    sourceFileId: "file-client",
    sourceSymbolId: kind === "calls_api" ? "symbol-handler" : null,
    targetRepositoryId: "repository-core",
    targetSymbolId: "symbol-refresh",
    kind,
    stableKey: `repository-web:src/client.ts:${kind}:repository-core:refreshSession`,
    provenance:
      kind === "calls_api"
        ? "typescript_public_api_call"
        : "typescript_public_api_import",
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
      ...(kind === "calls_api"
        ? {
            lines: [9],
            sourceSymbolStableKey: "src/client.ts:function:handler",
          }
        : { line: 2 }),
      scope: "cross_repository",
    },
  };
}

describe("RelationshipObservationBuilder", () => {
  it("records revision-stamped local, package, API import, and API call observations", () => {
    const observations = new RelationshipObservationBuilder().build({
      workspaceId: "workspace-1",
      repositoryId: "repository-core",
      sourceRevision: "core-revision",
      localRelationships: [localRelationship],
      packageRelationships: [packageRelationship],
      apiRelationships: [
        apiRelationship("imports_api"),
        apiRelationship("calls_api"),
      ],
      packages,
      symbols: [targetSymbol],
    });

    expect(observations).toHaveLength(4);
    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          observedByRepositoryId: "repository-core",
          observedRevision: "core-revision",
          sourceRepositoryId: "repository-core",
          sourceEntityKind: "file",
          sourceEntityKey: "src/api.ts",
          targetEntityKey: "src/session.ts",
          provenance: "typescript_static_import",
          sourceRevision: "core-revision",
          targetRevision: "core-revision",
        }),
        expect.objectContaining({
          sourceRepositoryId: "repository-web",
          sourceEntityKind: "package",
          sourceEntityKey: "@atlas/web:apps/web",
          targetRepositoryId: "repository-core",
          targetEntityKey: "@atlas/core:packages/core",
          provenance: "package_manifest_dependency",
          sourceRevision: "web-revision",
          targetRevision: "core-revision",
        }),
        expect.objectContaining({
          sourceEntityKind: "file",
          targetEntityKind: "symbol",
          targetEntityKey: "src/session.ts:function:refreshSession",
          provenance: "typescript_public_api_import",
        }),
        expect.objectContaining({
          sourceEntityKind: "symbol",
          sourceEntityKey: "src/client.ts:function:handler",
          provenance: "typescript_public_api_call",
        }),
      ]),
    );
    expect(
      observations.every((item) => item.workspaceId === "workspace-1"),
    ).toBe(true);
  });

  it("drops relationships whose persisted endpoints are outside the workspace", () => {
    const observations = new RelationshipObservationBuilder().build({
      workspaceId: "workspace-1",
      repositoryId: "repository-core",
      sourceRevision: "core-revision",
      localRelationships: [],
      packageRelationships: [
        {
          ...packageRelationship,
          workspaceId: "workspace-2",
        },
      ],
      apiRelationships: [
        {
          ...apiRelationship("calls_api"),
          workspaceId: "workspace-2",
        },
      ],
      packages,
      symbols: [targetSymbol],
    });

    expect(observations).toEqual([]);
  });
});
