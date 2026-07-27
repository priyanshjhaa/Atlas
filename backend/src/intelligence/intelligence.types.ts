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
}
