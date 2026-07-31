import { describe, expect, it } from "vitest";
import {
  ApiSymbolLinkerService,
  type PersistedApiPackage,
  type PersistedCodeImport,
  type PersistedPublicApiSymbol,
} from "../src/intelligence/api-symbol-linker.service";

const imported: PersistedCodeImport = {
  id: "import-1",
  workspaceId: "workspace-1",
  repositoryId: "repository-consumer",
  fileId: "file-consumer",
  filePath: "src/consumer.ts",
  specifier: "@atlas/core",
  line: 3,
  bindings: [
    {
      localName: "fetchUser",
      importedName: "loadUser",
      kind: "named",
      typeOnly: false,
    },
  ],
  sourceRevision: "consumer-revision",
};

const targetPackage: PersistedApiPackage = {
  id: "package-core",
  workspaceId: "workspace-1",
  repositoryId: "repository-core",
  name: "@atlas/core",
  entryPoints: ["src/index.ts"],
  exportMappings: {
    "@atlas/core": ["src/index.ts"],
  },
};

const targetSymbol: PersistedPublicApiSymbol = {
  id: "symbol-load-user",
  workspaceId: "workspace-1",
  repositoryId: "repository-core",
  packageId: "package-core",
  filePath: "src/users.ts",
  stableKey: "src/users.ts:function:loadUser",
  name: "loadUser",
  exportNames: ["loadUser"],
  apiSpecifiers: ["@atlas/core"],
  publicApi: true,
  sourceRevision: "core-revision",
};

describe("ApiSymbolLinkerService", () => {
  it("links an incoming package import to a re-exported public symbol", () => {
    const result = new ApiSymbolLinkerService().link(
      [imported],
      [
        {
          id: "call-1",
          workspaceId: "workspace-1",
          repositoryId: "repository-consumer",
          fileId: "file-consumer",
          filePath: "src/consumer.ts",
          sourceSymbolId: "symbol-handler",
          sourceSymbolStableKey: "src/consumer.ts:function:handler",
          localName: "fetchUser",
          memberName: null,
          line: 8,
          sourceRevision: "consumer-revision",
        },
      ],
      [targetPackage],
      [targetSymbol],
      "repository-core",
    );

    expect(result).toMatchObject({
      ambiguousPackageImports: 0,
      ambiguousSymbolImports: 0,
    });
    expect(result.relationships).toHaveLength(2);
    const importLink = result.relationships.find(
      (item) => item.kind === "imports_api",
    );
    const callLink = result.relationships.find(
      (item) => item.kind === "calls_api",
    );
    expect(importLink).toMatchObject({
      sourceRepositoryId: "repository-consumer",
      sourceFileId: "file-consumer",
      targetRepositoryId: "repository-core",
      targetSymbolId: "symbol-load-user",
      provenance: "typescript_public_api_import",
      confidence: 1,
      sourceRevision: "consumer-revision",
      targetRevision: "core-revision",
      evidence: {
        sourcePath: "src/consumer.ts",
        targetPath: "src/users.ts",
        packageName: "@atlas/core",
        importSpecifier: "@atlas/core",
        importedName: "loadUser",
        localName: "fetchUser",
        typeOnly: false,
        line: 3,
        scope: "cross_repository",
      },
    });
    expect(callLink).toMatchObject({
      sourceSymbolId: "symbol-handler",
      targetSymbolId: "symbol-load-user",
      provenance: "typescript_public_api_call",
      evidence: {
        importedName: "loadUser",
        localName: "fetchUser",
        lines: [8],
        sourceSymbolStableKey: "src/consumer.ts:function:handler",
        scope: "cross_repository",
      },
    });
  });

  it("refuses ambiguous package and symbol targets", () => {
    const duplicatePackage: PersistedApiPackage = {
      ...targetPackage,
      id: "package-core-copy",
      repositoryId: "repository-core-copy",
    };
    const packageAmbiguity = new ApiSymbolLinkerService().link(
      [imported],
      [],
      [targetPackage, duplicatePackage],
      [targetSymbol],
      "repository-consumer",
    );
    expect(packageAmbiguity.relationships).toEqual([]);
    expect(packageAmbiguity.ambiguousPackageImports).toBe(1);

    const symbolAmbiguity = new ApiSymbolLinkerService().link(
      [imported],
      [],
      [targetPackage],
      [
        targetSymbol,
        {
          ...targetSymbol,
          id: "symbol-load-user-copy",
          stableKey: "src/users.ts:function:loadUser#2",
        },
      ],
      "repository-consumer",
    );
    expect(symbolAmbiguity.relationships).toEqual([]);
    expect(symbolAmbiguity.ambiguousSymbolImports).toBe(1);
  });

  it("links namespace member calls without inventing a namespace symbol", () => {
    const namespaceImport: PersistedCodeImport = {
      ...imported,
      bindings: [
        {
          localName: "core",
          importedName: "*",
          kind: "namespace",
          typeOnly: false,
        },
      ],
    };
    const result = new ApiSymbolLinkerService().link(
      [namespaceImport],
      [
        {
          id: "call-namespace",
          workspaceId: "workspace-1",
          repositoryId: "repository-consumer",
          fileId: "file-consumer",
          filePath: "src/consumer.ts",
          sourceSymbolId: null,
          sourceSymbolStableKey: null,
          localName: "core",
          memberName: "loadUser",
          line: 12,
          sourceRevision: "consumer-revision",
        },
      ],
      [targetPackage],
      [targetSymbol],
      "repository-consumer",
    );

    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]).toMatchObject({
      kind: "calls_api",
      sourceSymbolId: null,
      targetSymbolId: "symbol-load-user",
      evidence: {
        importedName: "loadUser",
        localName: "core",
        lines: [12],
      },
    });
  });
});
