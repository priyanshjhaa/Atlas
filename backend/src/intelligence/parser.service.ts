import { Injectable } from "@nestjs/common";
import * as ts from "typescript";
import type {
  ParsedChunk,
  ParsedFile,
  ParsedImport,
  ParsedSymbol,
  RepositorySourceFile,
} from "./intelligence.types";

const symbolKinds = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.ModuleDeclaration,
  ts.SyntaxKind.VariableStatement,
]);

function isTsJs(language: string) {
  return ["typescript", "tsx", "javascript", "jsx", "mjs", "cjs"].includes(
    language,
  );
}

function scriptKind(path: string) {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(js|mjs|cjs)$/.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function range(source: ts.SourceFile, node: ts.Node) {
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  const end = source.getLineAndCharacterOfPosition(node.getEnd());
  return { lineStart: start.line + 1, lineEnd: end.line + 1 };
}

function exported(node: ts.Node) {
  return Boolean(
    ts.canHaveModifiers(node) &&
      ts
        .getModifiers(node)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
}

function symbolIdentity(node: ts.Node) {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node)
  ) {
    return node.name?.getText() ?? null;
  }
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations
      .map((declaration) => declaration.name.getText())
      .join(", ");
  }
  return null;
}

function symbolKind(node: ts.Node) {
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isModuleDeclaration(node)) return "module";
  if (ts.isVariableStatement(node)) return "variable";
  return "symbol";
}

function estimateTokens(content: string) {
  return Math.max(1, Math.ceil(content.length / 4));
}

function lineChunks(
  file: RepositorySourceFile,
  imports: ParsedImport[],
  exports: string[],
): ParsedChunk[] {
  const lines = file.content.split(/\r?\n/);
  const chunks: ParsedChunk[] = [];
  for (let start = 0; start < lines.length; start += 80) {
    const selected = lines.slice(start, start + 80);
    const content = selected.join("\n").trim();
    if (!content) continue;
    chunks.push({
      chunkIndex: chunks.length,
      content,
      language: file.language,
      tokenCount: estimateTokens(content),
      metadata: {
        filePath: file.path,
        chunkType: "text",
        lineStart: start + 1,
        lineEnd: start + selected.length,
        imports: imports.map((item) => item.specifier),
        exports,
      },
    });
  }
  return chunks;
}

@Injectable()
export class ParserService {
  parseFiles(files: RepositorySourceFile[]): ParsedFile[] {
    return files.map((file) => this.parseFile(file));
  }

  private parseFile(file: RepositorySourceFile): ParsedFile {
    if (!isTsJs(file.language)) {
      return {
        ...file,
        imports: [],
        exports: [],
        symbols: [],
        chunks: lineChunks(file, [], []),
      };
    }

    const source = ts.createSourceFile(
      file.path,
      file.content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(file.path),
    );
    const imports: ParsedImport[] = [];
    const exports: string[] = [];
    const symbols: ParsedSymbol[] = [];
    const chunks: ParsedChunk[] = [];

    source.forEachChild((node) => {
      if (ts.isImportDeclaration(node)) {
        imports.push({
          specifier: node.moduleSpecifier
            .getText(source)
            .replace(/^["']|["']$/g, ""),
          line: range(source, node).lineStart,
        });
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        exports.push(
          node.moduleSpecifier.getText(source).replace(/^["']|["']$/g, ""),
        );
      }
      if (!symbolKinds.has(node.kind)) return;
      const name = symbolIdentity(node);
      if (!name) return;

      const lines = range(source, node);
      const kind = symbolKind(node);
      const isExported = exported(node);
      if (isExported) exports.push(name);
      const stableKey = `${file.path}:${kind}:${name}:${lines.lineStart}`;
      symbols.push({
        stableKey,
        name,
        kind,
        exported: isExported,
        ...lines,
        metadata: { filePath: file.path },
      });
      const content = node.getText(source);
      chunks.push({
        chunkIndex: chunks.length,
        content,
        summary: `${kind} ${name} in ${file.path}`,
        language: file.language,
        tokenCount: estimateTokens(content),
        metadata: {
          filePath: file.path,
          chunkType: "symbol",
          symbol: name,
          symbolKind: kind,
          ...lines,
          imports: imports.map((item) => item.specifier),
          exports,
        },
      });
    });

    return {
      ...file,
      imports,
      exports: [...new Set(exports)],
      symbols,
      chunks: chunks.length ? chunks : lineChunks(file, imports, exports),
    };
  }
}
