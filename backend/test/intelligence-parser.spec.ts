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
      diagnostics: [],
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
        diagnosticCount: 0,
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
});
