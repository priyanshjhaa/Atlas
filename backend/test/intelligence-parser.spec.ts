import { describe, expect, it } from "vitest";
import { ArchitectureBuilderService } from "../src/intelligence/architecture-builder.service";
import { ParserService } from "../src/intelligence/parser.service";
import { RelationshipExtractorService } from "../src/intelligence/relationship-extractor.service";
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
    const relationships = new RelationshipExtractorService().extract(parsed);

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
    });
  });

  it("builds architecture only from observed parsed relationships", () => {
    const parsed = new ParserService().parseFiles(files);
    const relationships = new RelationshipExtractorService().extract(parsed);
    const snapshot = new ArchitectureBuilderService().build(
      "atlas-api",
      parsed,
      relationships,
    );

    expect(snapshot.summary).toContain("2 indexed files");
    expect(snapshot.moduleMap.generatedFrom).toBe(
      "observed_static_analysis",
    );
    expect(snapshot.moduleMap.stats).toMatchObject({
      relationshipsObserved: 1,
    });
  });
});
