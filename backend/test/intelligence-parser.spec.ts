import { describe, expect, it } from "vitest";
import { ArchitectureBuilderService } from "../src/intelligence/architecture-builder.service";
import { ParserService } from "../src/intelligence/parser.service";
import { RelationshipExtractorService } from "../src/intelligence/relationship-extractor.service";
import { TypeCheckerService } from "../src/intelligence/type-checker.service";
import type { RepositorySourceFile } from "../src/intelligence/intelligence.types";

const files: RepositorySourceFile[] = [
  {
    path: "src/api.ts",
    language: "typescript",
    content:
      'import { loadUser } from "./users";\nexport function handler() { return loadUser(); }\n',
    checksum: "a",
    sizeBytes: 90,
  },
  {
    path: "src/users.ts",
    language: "typescript",
    content: "export function loadUser() { return { id: 1 }; }\n",
    checksum: "b",
    sizeBytes: 54,
  },
];

describe("forked CodeMap intelligence services", () => {
  it("extracts symbols, citations, and observed import evidence", () => {
    const parsed = new ParserService().parseFiles(files);
    const typeChecker = new TypeCheckerService().analyze(parsed);
    const relationships = new RelationshipExtractorService().extract(
      parsed,
      typeChecker,
    );

    expect(parsed[0]?.symbols[0]).toMatchObject({
      name: "handler",
      kind: "function",
      exported: true,
      lineStart: 2,
    });
    expect(parsed[0]?.chunks[0]?.metadata).toMatchObject({
      filePath: "src/api.ts",
      lineStart: 2,
    });
    expect(relationships).toHaveLength(1);
    expect(relationships[0]).toMatchObject({
      sourcePath: "src/api.ts",
      targetPath: "src/users.ts",
      provenance: "typescript_static_import",
      confidence: 1,
    });
    expect(relationships[0]?.evidence).toMatchObject({
      importSpecifier: "./users",
      line: 1,
      resolvedBy: "typescript_type_checker",
      resolutionKind: "relative",
      importedSymbols: [
        {
          localName: "loadUser",
          exportedName: "loadUser",
          targetName: "loadUser",
          targetKind: "function",
          targetPath: "src/users.ts",
        },
      ],
    });
    expect(typeChecker).toMatchObject({
      filesAnalyzed: 2,
      importsResolved: 1,
      pathAliasesResolved: 0,
      diagnostics: [],
      configuration: {
        configFilePath: null,
        configuredRootFiles: 0,
      },
    });
  });

  it("builds architecture only from observed parsed relationships", () => {
    const parsed = new ParserService().parseFiles(files);
    const typeChecker = new TypeCheckerService().analyze(parsed);
    const relationships = new RelationshipExtractorService().extract(
      parsed,
      typeChecker,
    );
    const snapshot = new ArchitectureBuilderService().build(
      "atlas-api",
      parsed,
      relationships,
      typeChecker,
    );

    expect(snapshot.summary).toContain("2 indexed files");
    expect(snapshot.moduleMap.generatedFrom).toBe(
      "observed_static_analysis",
    );
    expect(snapshot.moduleMap.stats).toMatchObject({
      relationshipsObserved: 1,
      typeChecker: {
        filesAnalyzed: 2,
        importsResolved: 1,
        pathAliasesResolved: 0,
        diagnosticCount: 0,
        configFilePath: null,
        configuredRootFiles: 0,
      },
    });
  });

  it("reports compiler diagnostics without dropping valid source analysis", () => {
    const parsed = new ParserService().parseFiles([
      ...files,
      {
        path: "src/broken.ts",
        language: "typescript",
        content:
          'import { missing } from "./does-not-exist";\nexport const value: number = "wrong";\n',
        checksum: "c",
        sizeBytes: 88,
      },
    ]);

    const analysis = new TypeCheckerService().analyze(parsed);

    expect(analysis.filesAnalyzed).toBe(3);
    expect(analysis.importsResolved).toBe(1);
    expect(analysis.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 2307,
          category: "error",
          filePath: "src/broken.ts",
          line: 1,
        }),
        expect.objectContaining({
          code: 2322,
          category: "error",
          filePath: "src/broken.ts",
          line: 2,
        }),
      ]),
    );
  });

  it("applies repository tsconfig compiler options and source scope", () => {
    const parsed = new ParserService().parseFiles([
      ...files,
      {
        path: "src/untyped.ts",
        language: "typescript",
        content: "export function identity(value) { return value; }\n",
        checksum: "d",
        sizeBytes: 51,
      },
      {
        path: "tsconfig.json",
        language: "json",
        content: JSON.stringify({
          compilerOptions: { strict: true },
          include: ["src/**/*.ts"],
        }),
        checksum: "e",
        sizeBytes: 72,
      },
      {
        path: "scripts/ignored.ts",
        language: "typescript",
        content: "export function ignored(value) { return value; }\n",
        checksum: "f",
        sizeBytes: 50,
      },
    ]);

    const analysis = new TypeCheckerService().analyze(parsed);

    expect(analysis.configuration).toEqual({
      configFilePath: "tsconfig.json",
      configuredRootFiles: 3,
      projectConfigPaths: ["tsconfig.json"],
      projectReferences: 0,
    });
    expect(analysis.filesAnalyzed).toBe(3);
    expect(
      analysis.diagnostics.some(
        (diagnostic) => diagnostic.filePath === "scripts/ignored.ts",
      ),
    ).toBe(false);
    expect(analysis.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 7006,
        filePath: "src/untyped.ts",
        line: 1,
      }),
    );
  });

  it("resolves configured path aliases into observed relationships", () => {
    const aliasFiles: RepositorySourceFile[] = [
      {
        path: "src/api.ts",
        language: "typescript",
        content:
          'import { loadUser } from "@core/users";\nexport const handler = () => loadUser();\n',
        checksum: "g",
        sizeBytes: 88,
      },
      {
        path: "src/core/users.ts",
        language: "typescript",
        content: "export const loadUser = () => ({ id: 1 });\n",
        checksum: "h",
        sizeBytes: 47,
      },
      {
        path: "tsconfig.json",
        language: "json",
        content: JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: { "@core/*": ["src/core/*"] },
          },
          include: ["src/**/*.ts"],
        }),
        checksum: "i",
        sizeBytes: 110,
      },
    ];
    const parsed = new ParserService().parseFiles(aliasFiles);
    const typeChecker = new TypeCheckerService().analyze(parsed);
    const relationships = new RelationshipExtractorService().extract(
      parsed,
      typeChecker,
    );

    expect(typeChecker).toMatchObject({
      importsResolved: 1,
      pathAliasesResolved: 1,
    });
    expect(typeChecker.resolvedImports[0]).toMatchObject({
      sourcePath: "src/api.ts",
      targetPath: "src/core/users.ts",
      specifier: "@core/users",
      resolutionKind: "configured_path_alias",
    });
    expect(relationships).toHaveLength(1);
    expect(relationships[0]).toMatchObject({
      sourcePath: "src/api.ts",
      targetPath: "src/core/users.ts",
      evidence: {
        importSpecifier: "@core/users",
        resolvedBy: "typescript_type_checker",
        resolutionKind: "configured_path_alias",
      },
    });
  });

  it("traverses referenced TypeScript projects with their own options", () => {
    const projectFiles: RepositorySourceFile[] = [
      {
        path: "packages/api/src/index.ts",
        language: "typescript",
        content:
          'import { loadUser } from "@core/users";\nexport const handler = () => loadUser();\n',
        checksum: "j",
        sizeBytes: 88,
      },
      {
        path: "packages/core/src/users.ts",
        language: "typescript",
        content: "export const loadUser = () => ({ id: 1 });\n",
        checksum: "k",
        sizeBytes: 47,
      },
      {
        path: "tsconfig.json",
        language: "json",
        content: JSON.stringify({
          files: [],
          references: [
            { path: "packages/core" },
            { path: "packages/api" },
          ],
        }),
        checksum: "l",
        sizeBytes: 100,
      },
      {
        path: "packages/core/tsconfig.json",
        language: "json",
        content: JSON.stringify({
          compilerOptions: { composite: true },
          include: ["src/**/*.ts"],
        }),
        checksum: "m",
        sizeBytes: 80,
      },
      {
        path: "packages/api/tsconfig.json",
        language: "json",
        content: JSON.stringify({
          compilerOptions: {
            composite: true,
            baseUrl: ".",
            paths: { "@core/*": ["../core/src/*"] },
          },
          include: ["src/**/*.ts"],
        }),
        checksum: "n",
        sizeBytes: 140,
      },
    ];
    const parsed = new ParserService().parseFiles(projectFiles);
    const typeChecker = new TypeCheckerService().analyze(parsed);
    const relationships = new RelationshipExtractorService().extract(
      parsed,
      typeChecker,
    );

    expect(typeChecker.configuration).toEqual({
      configFilePath: "tsconfig.json",
      configuredRootFiles: 2,
      projectConfigPaths: [
        "tsconfig.json",
        "packages/core/tsconfig.json",
        "packages/api/tsconfig.json",
      ],
      projectReferences: 2,
    });
    expect(typeChecker).toMatchObject({
      filesAnalyzed: 2,
      importsResolved: 1,
      pathAliasesResolved: 1,
    });
    expect(relationships[0]).toMatchObject({
      sourcePath: "packages/api/src/index.ts",
      targetPath: "packages/core/src/users.ts",
      evidence: {
        resolvedBy: "typescript_type_checker",
        resolutionKind: "configured_path_alias",
      },
    });
  });
});
