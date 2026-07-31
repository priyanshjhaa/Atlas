import { Injectable } from "@nestjs/common";
import { dirname, join, normalize } from "node:path/posix";
import type {
  ObservedRelationship,
  ParsedFile,
  TypeCheckerAnalysis,
} from "./intelligence.types";

const sourceExtensions = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
];

function normalizePath(path: string) {
  return normalize(path).replace(/^\.\//, "");
}

@Injectable()
export class RelationshipExtractorService {
  extract(
    files: ParsedFile[],
    typeChecker?: TypeCheckerAnalysis,
  ): ObservedRelationship[] {
    const paths = new Set(files.map((file) => file.path));
    const relationships = new Map<string, ObservedRelationship>();
    const compilerResolutions = new Map(
      typeChecker?.resolvedImports.map((item) => [
        `${item.sourcePath}:${item.line}:${item.specifier}`,
        item,
      ]) ?? [],
    );

    for (const file of files) {
      for (const imported of file.imports) {
        const compilerResolution = compilerResolutions.get(
          `${file.path}:${imported.line}:${imported.specifier}`,
        );
        const targetPath =
          compilerResolution?.targetPath ??
          this.resolve(file.path, imported.specifier, paths);
        if (!targetPath || targetPath === file.path) continue;
        const stableKey = `${file.path}:imports:${targetPath}`;
        const existing = relationships.get(stableKey);
        if (existing && existing.evidence.line <= imported.line) continue;

        relationships.set(stableKey, {
          sourcePath: file.path,
          targetPath,
          kind: "imports",
          stableKey,
          provenance: "typescript_static_import",
          confidence: 1,
          evidence: {
            sourcePath: file.path,
            targetPath,
            importSpecifier: imported.specifier,
            line: imported.line,
            resolvedBy: compilerResolution
              ? "typescript_type_checker"
              : "syntax_path_fallback",
            ...(compilerResolution?.symbols.length
              ? { importedSymbols: compilerResolution.symbols }
              : {}),
          },
        });
      }
    }
    return [...relationships.values()];
  }

  private resolve(
    fromPath: string,
    specifier: string,
    paths: Set<string>,
  ): string | null {
    if (!specifier.startsWith(".")) return null;
    const base = normalizePath(join(dirname(fromPath), specifier));
    const candidates = [
      base,
      ...sourceExtensions.map((extension) => `${base}${extension}`),
      ...sourceExtensions.map((extension) => `${base}/index${extension}`),
    ];
    return candidates.find((candidate) => paths.has(candidate)) ?? null;
  }
}
