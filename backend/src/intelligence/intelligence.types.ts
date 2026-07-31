export interface RepositorySourceFile {
  path: string;
  language: string;
  content: string;
  checksum: string;
  sizeBytes: number;
}

export interface ParsedImport {
  specifier: string;
  line: number;
}

export interface TypeCheckedImportSymbol {
  localName: string;
  exportedName: string;
  targetName: string;
  targetKind: string;
  targetPath: string;
}

export interface TypeCheckedImport {
  sourcePath: string;
  targetPath: string;
  specifier: string;
  line: number;
  resolutionKind:
    | "relative"
    | "configured_path_alias"
    | "workspace_package";
  symbols: TypeCheckedImportSymbol[];
}

export interface TypeCheckDiagnostic {
  code: number;
  category: "warning" | "error" | "suggestion" | "message";
  message: string;
  filePath?: string;
  line?: number;
  character?: number;
}

export interface TypeCheckerAnalysis {
  filesAnalyzed: number;
  importsResolved: number;
  pathAliasesResolved: number;
  workspaceImportsResolved: number;
  diagnostics: TypeCheckDiagnostic[];
  resolvedImports: TypeCheckedImport[];
  configuration: {
    configFilePath: string | null;
    configuredRootFiles: number;
    projectConfigPaths: string[];
    projectReferences: number;
  };
}

export interface WorkspacePackage {
  name: string;
  version: string | null;
  rootPath: string;
  manifestPath: string;
  entryPoints: string[];
  dependencyNames: string[];
  dependencies: WorkspacePackageDependency[];
}

export interface WorkspacePackageDependency {
  name: string;
  range: string;
  kind: "runtime" | "development" | "peer" | "optional";
}

export interface WorkspaceAnalysis {
  rootManifestPath: string | null;
  workspacePatterns: string[];
  packages: WorkspacePackage[];
  pathMappings: Record<string, string[]>;
  warnings: string[];
}

export interface ParsedSymbol {
  stableKey: string;
  name: string;
  kind: string;
  lineStart: number;
  lineEnd: number;
  exported: boolean;
  metadata: Record<string, unknown>;
}

export interface ParsedChunk {
  chunkIndex: number;
  content: string;
  summary?: string;
  language: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
}

export interface ParsedFile extends RepositorySourceFile {
  imports: ParsedImport[];
  exports: string[];
  symbols: ParsedSymbol[];
  chunks: ParsedChunk[];
}

export interface ObservedRelationship {
  sourcePath: string;
  targetPath: string;
  kind: "imports";
  stableKey: string;
  provenance: "typescript_static_import";
  confidence: number;
  evidence: {
    sourcePath: string;
    targetPath: string;
    importSpecifier: string;
    line: number;
    resolvedBy: "typescript_type_checker" | "syntax_path_fallback";
    resolutionKind:
      | "relative"
      | "configured_path_alias"
      | "workspace_package";
    importedSymbols?: TypeCheckedImportSymbol[];
  };
}

export interface ArchitectureSnapshotData {
  summary: string;
  diagram: string;
  moduleMap: Record<string, unknown>;
}

export interface IngestionSummary {
  filesIndexed: number;
  chunksCreated: number;
  symbolsExtracted: number;
  relationshipsExtracted: number;
  languages: string[];
  embeddingProvider: "local" | "openai";
  typeChecker: {
    filesAnalyzed: number;
    importsResolved: number;
    pathAliasesResolved: number;
    workspaceImportsResolved: number;
    diagnosticCount: number;
    configFilePath: string | null;
    configuredRootFiles: number;
    projectConfigPaths: string[];
    projectReferences: number;
  };
  workspace: {
    packageCount: number;
    packageNames: string[];
    warningCount: number;
    relationshipsLinked: number;
    ambiguousDependencies: number;
  };
}
