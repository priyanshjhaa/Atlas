import { Injectable } from "@nestjs/common";
import {
  basename,
  dirname,
  join,
  matchesGlob,
  normalize,
  relative,
} from "node:path/posix";
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

function absoluteRepositoryPath(rootPath: string, path: string) {
  return join(rootPath, normalizeRepositoryPath(path));
}

function repositoryPath(rootPath: string, path: string) {
  const normalized = normalize(path);
  if (normalized === rootPath || !normalized.startsWith(`${rootPath}/`)) {
    return null;
  }
  return relative(rootPath, normalized);
}

function scriptKind(path: string) {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (path.endsWith(".json")) return ts.ScriptKind.JSON;
  if (/\.(js|mjs|cjs)$/.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function readConfiguredFiles(
  paths: Iterable<string>,
  rootPath: string,
  extensions: readonly string[],
  excludes: readonly string[] | undefined,
  includes: readonly string[],
  depth?: number,
) {
  const normalizedRoot = normalize(rootPath);
  const matchesPattern = (candidate: string, pattern: string) => {
    const normalizedPattern = normalize(pattern);
    return matchesGlob(
      normalizedPattern.startsWith("/")
        ? candidate
        : relative(normalizedRoot, candidate),
      normalizedPattern,
    );
  };

  return [...paths].filter((candidate) => {
    if (!candidate.startsWith(`${normalizedRoot}/`)) return false;
    if (!extensions.some((extension) => candidate.endsWith(extension))) {
      return false;
    }
    const relativePath = relative(normalizedRoot, candidate);
    if (
      depth !== undefined &&
      relativePath.split("/").length - 1 > depth
    ) {
      return false;
    }
    if (
      excludes?.some((pattern) =>
        matchesPattern(candidate, pattern),
      )
    ) {
      return false;
    }
    return (
      !includes.length ||
      includes.some((pattern) => matchesPattern(candidate, pattern))
    );
  });
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
  rootPath: string,
) {
  if (!symbol) return null;
  const target = aliasedSymbol(checker, symbol);
  const declaration = target
    .getDeclarations()
    ?.find((item) => repositoryPath(rootPath, item.getSourceFile().fileName));
  if (!declaration) return null;
  const targetPath = repositoryPath(
    rootPath,
    declaration.getSourceFile().fileName,
  );
  if (!targetPath) return null;
  return { symbol: target, targetPath };
}

function importedSymbols(
  checker: ts.TypeChecker,
  node: ts.ImportDeclaration,
  moduleTargetPath: string,
  rootPath: string,
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
      rootPath,
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
  analyze(
    files: ParsedFile[],
    repositoryRoot?: string,
  ): TypeCheckerAnalysis {
    const compilerFiles = files.filter((file) =>
      supportedLanguages.has(file.language),
    );
    if (!compilerFiles.length) {
      return {
        filesAnalyzed: 0,
        importsResolved: 0,
        pathAliasesResolved: 0,
        diagnostics: [],
        resolvedImports: [],
        configuration: {
          configFilePath: null,
          configuredRootFiles: 0,
        },
      };
    }

    const rootPath = normalize(repositoryRoot ?? virtualRoot);
    const sourceByPath = new Map(
      files.map((file) => [
        absoluteRepositoryPath(rootPath, file.path),
        file,
      ]),
    );
    const defaultOptions: ts.CompilerOptions = {
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
    const configFile = files
      .filter((file) => /^tsconfig(?:\.[^/]+)?\.json$/.test(basename(file.path)))
      .sort((left, right) => {
        const leftDepth = left.path.split("/").length;
        const rightDepth = right.path.split("/").length;
        const leftRoot = left.path === "tsconfig.json" ? 0 : 1;
        const rightRoot = right.path === "tsconfig.json" ? 0 : 1;
        return (
          leftRoot - rightRoot ||
          leftDepth - rightDepth ||
          left.path.localeCompare(right.path)
        );
      })[0];
    const configDiagnostics: ts.Diagnostic[] = [];
    const parseHost: ts.ParseConfigFileHost = {
      useCaseSensitiveFileNames: true,
      fileExists: (path) => sourceByPath.has(normalize(path)),
      readFile: (path) => sourceByPath.get(normalize(path))?.content,
      readDirectory: (path, extensions, excludes, includes, depth) =>
        readConfiguredFiles(
          sourceByPath.keys(),
          path,
          extensions,
          excludes,
          includes,
          depth,
        ),
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        configDiagnostics.push(diagnostic);
      },
      getCurrentDirectory: () => rootPath,
    };
    const parsedConfiguration = configFile
      ? ts.getParsedCommandLineOfConfigFile(
          absoluteRepositoryPath(rootPath, configFile.path),
          undefined,
          parseHost,
        )
      : undefined;
    if (parsedConfiguration) {
      configDiagnostics.push(...parsedConfiguration.errors);
    }
    const options: ts.CompilerOptions = {
      ...defaultOptions,
      ...parsedConfiguration?.options,
      incremental: false,
      noEmit: true,
      skipLibCheck: true,
    };
    const configuredRootNames =
      parsedConfiguration?.fileNames.filter((path) =>
        sourceByPath.has(normalize(path)),
      ) ?? [];
    const rootNames = configuredRootNames.length
      ? configuredRootNames
      : compilerFiles.map((file) =>
          absoluteRepositoryPath(rootPath, file.path),
        );
    const baseHost = ts.createCompilerHost(options, true);
    const virtualDirectories = new Set<string>([rootPath]);
    for (const path of sourceByPath.keys()) {
      let directory = dirname(path);
      while (
        directory === rootPath ||
        directory.startsWith(`${rootPath}/`)
      ) {
        virtualDirectories.add(directory);
        if (directory === rootPath) break;
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
      getCurrentDirectory: () => rootPath,
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
      rootNames,
      options,
      host,
    });
    const checker = program.getTypeChecker();
    const resolvedImports: TypeCheckedImport[] = [];
    const analyzedFiles = compilerFiles.filter((file) =>
      program.getSourceFile(absoluteRepositoryPath(rootPath, file.path)),
    );

    for (const file of analyzedFiles) {
      const source = program.getSourceFile(
        absoluteRepositoryPath(rootPath, file.path),
      );
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
          rootPath,
        );
        if (!moduleTarget) return;
        const start = source.getLineAndCharacterOfPosition(node.getStart());
        resolvedImports.push({
          sourcePath: file.path,
          targetPath: moduleTarget.targetPath,
          specifier: node.moduleSpecifier.text,
          line: start.line + 1,
          resolutionKind: node.moduleSpecifier.text.startsWith(".")
            ? "relative"
            : "configured_path_alias",
          symbols: importedSymbols(
            checker,
            node,
            moduleTarget.targetPath,
            rootPath,
          ),
        });
      });
    }

    const diagnostics = [...configDiagnostics, ...ts.getPreEmitDiagnostics(program)]
      .slice(0, 100)
      .map<TypeCheckDiagnostic>((diagnostic) => {
        const location =
          diagnostic.file && diagnostic.start !== undefined
            ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
            : null;
        const filePath = diagnostic.file
          ? repositoryPath(rootPath, diagnostic.file.fileName)
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
      filesAnalyzed: analyzedFiles.length,
      importsResolved: resolvedImports.length,
      pathAliasesResolved: resolvedImports.filter(
        (item) => item.resolutionKind === "configured_path_alias",
      ).length,
      diagnostics,
      resolvedImports,
      configuration: {
        configFilePath: configFile?.path ?? null,
        configuredRootFiles: configuredRootNames.length,
      },
    };
  }
}
