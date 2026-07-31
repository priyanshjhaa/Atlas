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
  WorkspaceAnalysis,
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

function projectReferenceConfigPath(
  referencePath: string,
  sourceByPath: Map<string, ParsedFile>,
) {
  const normalized = normalize(referencePath);
  const candidates = [
    normalized,
    `${normalized}.json`,
    join(normalized, "tsconfig.json"),
  ];
  return candidates.find((candidate) => sourceByPath.has(candidate)) ?? null;
}

function createRepositoryCompilerHost(
  options: ts.CompilerOptions,
  rootPath: string,
  sourceByPath: Map<string, ParsedFile>,
) {
  const baseHost = ts.createCompilerHost(options, true);
  const repositoryDirectories = new Set<string>([rootPath]);
  for (const path of sourceByPath.keys()) {
    let directory = dirname(path);
    while (
      directory === rootPath ||
      directory.startsWith(`${rootPath}/`)
    ) {
      repositoryDirectories.add(directory);
      if (directory === rootPath) break;
      directory = dirname(directory);
    }
  }
  const compilerLibraryRoot = dirname(ts.getDefaultLibFilePath(options));
  const isCompilerLibraryPath = (path: string) => {
    const normalized = normalize(path);
    return (
      normalized === compilerLibraryRoot ||
      normalized.startsWith(`${compilerLibraryRoot}/`)
    );
  };

  const host: ts.CompilerHost = {
    ...baseHost,
    directoryExists: (path) => {
      const normalized = normalize(path);
      if (repositoryDirectories.has(normalized)) return true;
      return (
        isCompilerLibraryPath(normalized) &&
        Boolean(baseHost.directoryExists?.(path))
      );
    },
    fileExists: (path) => {
      const normalized = normalize(path);
      return (
        sourceByPath.has(normalized) ||
        (isCompilerLibraryPath(normalized) && baseHost.fileExists(path))
      );
    },
    getCurrentDirectory: () => rootPath,
    getDirectories: (path) => {
      const normalized = normalize(path);
      if (isCompilerLibraryPath(normalized)) {
        return baseHost.getDirectories?.(path) ?? [];
      }
      const prefix = `${normalized}/`;
      return [
        ...new Set(
          [...repositoryDirectories]
            .filter((item) => item.startsWith(prefix))
            .map((item) => item.slice(prefix.length).split("/")[0])
            .filter((item): item is string => Boolean(item)),
        ),
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
      if (!isCompilerLibraryPath(normalized)) return undefined;
      return baseHost.getSourceFile(
        path,
        languageVersion,
        onError,
        shouldCreateNew,
      );
    },
    readFile: (path) => {
      const normalized = normalize(path);
      const source = sourceByPath.get(normalized)?.content;
      if (source !== undefined) return source;
      return isCompilerLibraryPath(normalized)
        ? baseHost.readFile(path)
        : undefined;
    },
    realpath: (path) => {
      const normalized = normalize(path);
      return sourceByPath.has(normalized)
        ? normalized
        : isCompilerLibraryPath(normalized)
          ? (baseHost.realpath?.(path) ?? path)
          : normalized;
    },
    writeFile: () => undefined,
  };
  return host;
}

@Injectable()
export class TypeCheckerService {
  analyze(
    files: ParsedFile[],
    repositoryRoot?: string,
    workspace?: WorkspaceAnalysis,
  ): TypeCheckerAnalysis {
    const compilerFiles = files.filter((file) =>
      supportedLanguages.has(file.language),
    );
    if (!compilerFiles.length) {
      return {
        filesAnalyzed: 0,
        importsResolved: 0,
        pathAliasesResolved: 0,
        workspaceImportsResolved: 0,
        diagnostics: [],
        resolvedImports: [],
        configuration: {
          configFilePath: null,
          configuredRootFiles: 0,
          projectConfigPaths: [],
          projectReferences: 0,
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
    const workspacePaths = Object.fromEntries(
      Object.entries(workspace?.pathMappings ?? {}).map(
        ([specifier, targets]) => [
          specifier,
          targets.map((target) =>
            absoluteRepositoryPath(rootPath, target),
          ),
        ],
      ),
    );
    const workspacePackageNames = new Set(
      workspace?.packages.map((item) => item.name) ?? [],
    );
    const resolutionKind = (
      specifier: string,
    ): TypeCheckedImport["resolutionKind"] => {
      if (specifier.startsWith(".")) return "relative";
      if (
        [...workspacePackageNames].some(
          (name) =>
            specifier === name || specifier.startsWith(`${name}/`),
        )
      ) {
        return "workspace_package";
      }
      return "configured_path_alias";
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
    const parsedProjects: Array<{
      configPath: string;
      repositoryConfigPath: string;
      commandLine: ts.ParsedCommandLine;
    }> = [];
    const visitedConfigs = new Set<string>();
    const parseProject = (absoluteConfigPath: string): void => {
      const normalizedConfigPath = normalize(absoluteConfigPath);
      if (visitedConfigs.has(normalizedConfigPath)) return;
      visitedConfigs.add(normalizedConfigPath);
      const repositoryConfigPath = repositoryPath(
        rootPath,
        normalizedConfigPath,
      );
      if (!repositoryConfigPath) return;
      const commandLine = ts.getParsedCommandLineOfConfigFile(
        normalizedConfigPath,
        undefined,
        parseHost,
      );
      if (!commandLine) return;
      configDiagnostics.push(...commandLine.errors);
      parsedProjects.push({
        configPath: normalizedConfigPath,
        repositoryConfigPath,
        commandLine,
      });
      for (const reference of commandLine.projectReferences ?? []) {
        const referencedConfig = projectReferenceConfigPath(
          reference.path,
          sourceByPath,
        );
        if (referencedConfig) parseProject(referencedConfig);
      }
    };
    if (configFile) {
      parseProject(absoluteRepositoryPath(rootPath, configFile.path));
    }

    const configuredRootNames = new Set<string>();
    const programInputs = parsedProjects.length
      ? parsedProjects.map((project) => {
          const rootNames = project.commandLine.fileNames.filter((path) => {
            const normalized = normalize(path);
            if (!sourceByPath.has(normalized)) return false;
            configuredRootNames.add(normalized);
            return true;
          });
          return {
            rootNames,
            options: {
              ...defaultOptions,
              ...project.commandLine.options,
              baseUrl:
                project.commandLine.options.baseUrl ?? rootPath,
              composite: false,
              declaration: false,
              declarationMap: false,
              incremental: false,
              noEmit: true,
              paths: {
                ...workspacePaths,
                ...project.commandLine.options.paths,
              },
              skipLibCheck: true,
              tsBuildInfoFile: undefined,
            } satisfies ts.CompilerOptions,
          };
        })
      : [
          {
            rootNames: compilerFiles.map((file) =>
              absoluteRepositoryPath(rootPath, file.path),
            ),
            options: {
              ...defaultOptions,
              ...(Object.keys(workspacePaths).length
                ? {
                    baseUrl: rootPath,
                    paths: workspacePaths,
                  }
                : {}),
            },
          },
        ];
    const analyzedFilePaths = new Set<string>();
    const resolvedImportsByKey = new Map<string, TypeCheckedImport>();
    const compilerDiagnostics: ts.Diagnostic[] = [];

    for (const input of programInputs) {
      if (!input.rootNames.length) continue;
      const program = ts.createProgram({
        rootNames: input.rootNames,
        options: input.options,
        host: createRepositoryCompilerHost(
          input.options,
          rootPath,
          sourceByPath,
        ),
      });
      const checker = program.getTypeChecker();
      compilerDiagnostics.push(...ts.getPreEmitDiagnostics(program));

      for (const file of compilerFiles) {
        const source = program.getSourceFile(
          absoluteRepositoryPath(rootPath, file.path),
        );
        if (!source) continue;
        analyzedFilePaths.add(file.path);
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
          const resolvedImport: TypeCheckedImport = {
            sourcePath: file.path,
            targetPath: moduleTarget.targetPath,
            specifier: node.moduleSpecifier.text,
            line: start.line + 1,
            resolutionKind: resolutionKind(node.moduleSpecifier.text),
            symbols: importedSymbols(
              checker,
              node,
              moduleTarget.targetPath,
              rootPath,
            ),
          };
          resolvedImportsByKey.set(
            `${resolvedImport.sourcePath}:${resolvedImport.line}:${resolvedImport.specifier}`,
            resolvedImport,
          );
        });
      }
    }

    const diagnosticKeys = new Set<string>();
    const diagnostics = [...configDiagnostics, ...compilerDiagnostics]
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
      })
      .filter((diagnostic) => {
        const key = [
          diagnostic.code,
          diagnostic.filePath ?? "",
          diagnostic.line ?? "",
          diagnostic.character ?? "",
          diagnostic.message,
        ].join(":");
        if (diagnosticKeys.has(key)) return false;
        diagnosticKeys.add(key);
        return true;
      })
      .slice(0, 100);
    const resolvedImports = [...resolvedImportsByKey.values()];

    return {
      filesAnalyzed: analyzedFilePaths.size,
      importsResolved: resolvedImports.length,
      pathAliasesResolved: resolvedImports.filter(
        (item) => item.resolutionKind === "configured_path_alias",
      ).length,
      workspaceImportsResolved: resolvedImports.filter(
        (item) => item.resolutionKind === "workspace_package",
      ).length,
      diagnostics,
      resolvedImports,
      configuration: {
        configFilePath: configFile?.path ?? null,
        configuredRootFiles: configuredRootNames.size,
        projectConfigPaths: parsedProjects.map(
          (project) => project.repositoryConfigPath,
        ),
        projectReferences: Math.max(0, parsedProjects.length - 1),
      },
    };
  }
}
