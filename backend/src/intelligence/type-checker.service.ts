import { Injectable } from "@nestjs/common";
import { dirname, join, normalize, relative } from "node:path/posix";
import * as ts from "typescript";
import type {
  ParsedFile,
  TypeCheckDiagnostic,
  TypeCheckedImport,
  TypeCheckedImportSymbol,
  TypeCheckerAnalysis,
} from "./intelligence.types";

const virtualRoot = "/__atlas_repository__";
const supportedLanguages = new Set([
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "mjs",
  "cjs",
]);

function normalizeRepositoryPath(path: string) {
  return normalize(path).replace(/^(\.\.\/|\.\/|\/)+/, "");
}

function virtualPath(path: string) {
  return join(virtualRoot, normalizeRepositoryPath(path));
}

function repositoryPath(path: string) {
  const normalized = normalize(path);
  if (normalized === virtualRoot || !normalized.startsWith(`${virtualRoot}/`)) {
    return null;
  }
  return relative(virtualRoot, normalized);
}

function scriptKind(path: string) {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (path.endsWith(".json")) return ts.ScriptKind.JSON;
  if (/\.(js|mjs|cjs)$/.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function diagnosticCategory(
  category: ts.DiagnosticCategory,
): TypeCheckDiagnostic["category"] {
  switch (category) {
    case ts.DiagnosticCategory.Warning:
      return "warning";
    case ts.DiagnosticCategory.Error:
      return "error";
    case ts.DiagnosticCategory.Suggestion:
      return "suggestion";
    default:
      return "message";
  }
}

function symbolKind(symbol: ts.Symbol) {
  const declaration = symbol.getDeclarations()?.[0];
  if (!declaration) return "symbol";
  if (ts.isFunctionLike(declaration)) return "function";
  if (ts.isClassDeclaration(declaration)) return "class";
  if (ts.isInterfaceDeclaration(declaration)) return "interface";
  if (ts.isTypeAliasDeclaration(declaration)) return "type";
  if (ts.isEnumDeclaration(declaration)) return "enum";
  if (ts.isVariableDeclaration(declaration)) return "variable";
  if (ts.isSourceFile(declaration)) return "module";
  return ts.SyntaxKind[declaration.kind]?.toLowerCase() ?? "symbol";
}

function aliasedSymbol(checker: ts.TypeChecker, symbol: ts.Symbol) {
  if (!(symbol.flags & ts.SymbolFlags.Alias)) return symbol;
  try {
    return checker.getAliasedSymbol(symbol);
  } catch {
    return symbol;
  }
}

function targetForSymbol(
  checker: ts.TypeChecker,
  symbol: ts.Symbol | undefined,
) {
  if (!symbol) return null;
  const target = aliasedSymbol(checker, symbol);
  const declaration = target
    .getDeclarations()
    ?.find((item) => repositoryPath(item.getSourceFile().fileName));
  if (!declaration) return null;
  const targetPath = repositoryPath(declaration.getSourceFile().fileName);
  if (!targetPath) return null;
  return { symbol: target, targetPath };
}

function importedSymbols(
  checker: ts.TypeChecker,
  node: ts.ImportDeclaration,
  moduleTargetPath: string,
): TypeCheckedImportSymbol[] {
  const clause = node.importClause;
  if (!clause) return [];
  const bindings: Array<{
    localName: ts.Identifier;
    exportedName: string;
  }> = [];

  if (clause.name) {
    bindings.push({ localName: clause.name, exportedName: "default" });
  }
  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
    bindings.push({
      localName: clause.namedBindings.name,
      exportedName: "*",
    });
  }
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    for (const element of clause.namedBindings.elements) {
      bindings.push({
        localName: element.name,
        exportedName: element.propertyName?.text ?? element.name.text,
      });
    }
  }

  return bindings.map(({ localName, exportedName }) => {
    const resolved = targetForSymbol(
      checker,
      checker.getSymbolAtLocation(localName),
    );
    return {
      localName: localName.text,
      exportedName,
      targetName: resolved?.symbol.getName() ?? exportedName,
      targetKind: resolved ? symbolKind(resolved.symbol) : "symbol",
      targetPath: resolved?.targetPath ?? moduleTargetPath,
    };
  });
}

@Injectable()
export class TypeCheckerService {
  analyze(files: ParsedFile[]): TypeCheckerAnalysis {
    const compilerFiles = files.filter((file) =>
      supportedLanguages.has(file.language),
    );
    if (!compilerFiles.length) {
      return {
        filesAnalyzed: 0,
        importsResolved: 0,
        diagnostics: [],
        resolvedImports: [],
      };
    }

    const sourceByPath = new Map(
      files.map((file) => [virtualPath(file.path), file]),
    );
    const options: ts.CompilerOptions = {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
    };
    const baseHost = ts.createCompilerHost(options, true);
    const virtualDirectories = new Set<string>([virtualRoot]);
    for (const path of sourceByPath.keys()) {
      let directory = dirname(path);
      while (
        directory === virtualRoot ||
        directory.startsWith(`${virtualRoot}/`)
      ) {
        virtualDirectories.add(directory);
        if (directory === virtualRoot) break;
        directory = dirname(directory);
      }
    }

    const host: ts.CompilerHost = {
      ...baseHost,
      directoryExists: (path) =>
        virtualDirectories.has(normalize(path)) ||
        Boolean(baseHost.directoryExists?.(path)),
      fileExists: (path) =>
        sourceByPath.has(normalize(path)) || baseHost.fileExists(path),
      getCurrentDirectory: () => virtualRoot,
      getDirectories: (path) => {
        const normalized = normalize(path);
        const prefix = `${normalized}/`;
        const directories = [...virtualDirectories]
          .filter((item) => item.startsWith(prefix))
          .map((item) => item.slice(prefix.length).split("/")[0])
          .filter((item): item is string => Boolean(item));
        return [
          ...new Set([
            ...directories,
            ...(baseHost.getDirectories?.(path) ?? []),
          ]),
        ];
      },
      getSourceFile: (path, languageVersion, onError, shouldCreateNew) => {
        const normalized = normalize(path);
        const file = sourceByPath.get(normalized);
        if (file) {
          return ts.createSourceFile(
            normalized,
            file.content,
            languageVersion,
            true,
            scriptKind(normalized),
          );
        }
        return baseHost.getSourceFile(
          path,
          languageVersion,
          onError,
          shouldCreateNew,
        );
      },
      readFile: (path) =>
        sourceByPath.get(normalize(path))?.content ?? baseHost.readFile(path),
      realpath: (path) =>
        sourceByPath.has(normalize(path))
          ? normalize(path)
          : (baseHost.realpath?.(path) ?? path),
      writeFile: () => undefined,
    };
    const program = ts.createProgram({
      rootNames: compilerFiles.map((file) => virtualPath(file.path)),
      options,
      host,
    });
    const checker = program.getTypeChecker();
    const resolvedImports: TypeCheckedImport[] = [];

    for (const file of compilerFiles) {
      const source = program.getSourceFile(virtualPath(file.path));
      if (!source) continue;
      source.forEachChild((node) => {
        if (
          !ts.isImportDeclaration(node) ||
          !ts.isStringLiteral(node.moduleSpecifier)
        ) {
          return;
        }
        const moduleTarget = targetForSymbol(
          checker,
          checker.getSymbolAtLocation(node.moduleSpecifier),
        );
        if (!moduleTarget) return;
        const start = source.getLineAndCharacterOfPosition(node.getStart());
        resolvedImports.push({
          sourcePath: file.path,
          targetPath: moduleTarget.targetPath,
          specifier: node.moduleSpecifier.text,
          line: start.line + 1,
          symbols: importedSymbols(
            checker,
            node,
            moduleTarget.targetPath,
          ),
        });
      });
    }

    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .slice(0, 100)
      .map<TypeCheckDiagnostic>((diagnostic) => {
        const location =
          diagnostic.file && diagnostic.start !== undefined
            ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
            : null;
        const filePath = diagnostic.file
          ? repositoryPath(diagnostic.file.fileName)
          : null;
        return {
          code: diagnostic.code,
          category: diagnosticCategory(diagnostic.category),
          message: ts.flattenDiagnosticMessageText(
            diagnostic.messageText,
            "\n",
          ),
          ...(filePath ? { filePath } : {}),
          ...(location
            ? { line: location.line + 1, character: location.character + 1 }
            : {}),
        };
      });

    return {
      filesAnalyzed: compilerFiles.length,
      importsResolved: resolvedImports.length,
      diagnostics,
      resolvedImports,
    };
  }
}
