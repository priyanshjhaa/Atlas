import { Injectable } from "@nestjs/common";
import * as ts from "typescript";
import type {
  ParsedChunk,
  ParsedFile,
  ParsedImport,
  ParsedImportBinding,
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

function defaultExported(node: ts.Node) {
  return Boolean(
    ts.canHaveModifiers(node) &&
      ts
        .getModifiers(node)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword),
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
    return node.name?.getText() ?? (defaultExported(node) ? "default" : null);
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

function importBindings(node: ts.ImportDeclaration): ParsedImportBinding[] {
  const clause = node.importClause;
  if (!clause) return [];
  const bindings: ParsedImportBinding[] = [];
  if (clause.name) {
    bindings.push({
      localName: clause.name.text,
      importedName: "default",
      kind: "default",
      typeOnly: clause.isTypeOnly,
    });
  }
  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
    bindings.push({
      localName: clause.namedBindings.name.text,
      importedName: "*",
      kind: "namespace",
      typeOnly: clause.isTypeOnly,
    });
  }
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    for (const element of clause.namedBindings.elements) {
      bindings.push({
        localName: element.name.text,
        importedName: element.propertyName?.text ?? element.name.text,
        kind: "named",
        typeOnly: clause.isTypeOnly || element.isTypeOnly,
      });
    }
  }
  return bindings;
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
        calls: [],
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
    const calls: ParsedFile["calls"] = [];
    const exports: string[] = [];
    const symbols: ParsedSymbol[] = [];
    const chunks: ParsedChunk[] = [];
    const symbolOccurrences = new Map<string, number>();
    const stableKeyByDeclaration = new Map<ts.Node, string>();
    const localExportNames = new Map<string, string[]>();

    source.forEachChild((node) => {
      if (
        !ts.isExportDeclaration(node) ||
        node.moduleSpecifier ||
        !node.exportClause ||
        !ts.isNamedExports(node.exportClause)
      ) {
        return;
      }
      for (const element of node.exportClause.elements) {
        const localName = element.propertyName?.text ?? element.name.text;
        localExportNames.set(localName, [
          ...(localExportNames.get(localName) ?? []),
          element.name.text,
        ]);
      }
    });

    source.forEachChild((node) => {
      if (ts.isImportDeclaration(node)) {
        imports.push({
          specifier: node.moduleSpecifier
            .getText(source)
            .replace(/^["']|["']$/g, ""),
          line: range(source, node).lineStart,
          bindings: importBindings(node),
        });
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        exports.push(
          node.moduleSpecifier.getText(source).replace(/^["']|["']$/g, ""),
        );
      }
      if (!symbolKinds.has(node.kind)) return;
      const kind = symbolKind(node);
      const declarations = ts.isVariableStatement(node)
        ? node.declarationList.declarations
        : [node];
      for (const declaration of declarations) {
        const name = ts.isVariableDeclaration(declaration)
          ? declaration.name.getText(source)
          : symbolIdentity(declaration);
        if (!name) continue;
        const lines = range(source, declaration);
        const directExport = exported(node);
        const exportNames = [
          ...(directExport
            ? [defaultExported(node) ? "default" : name]
            : []),
          ...(localExportNames.get(name) ?? []),
        ];
        const isExported = exportNames.length > 0;
        exports.push(...exportNames);
        const stableBase = `${file.path}:${kind}:${name}`;
        const occurrence = (symbolOccurrences.get(stableBase) ?? 0) + 1;
        symbolOccurrences.set(stableBase, occurrence);
        const stableKey =
          occurrence === 1 ? stableBase : `${stableBase}#${occurrence}`;
        symbols.push({
          stableKey,
          name,
          kind,
          exported: isExported,
          exportNames: [...new Set(exportNames)],
          ...lines,
          metadata: { filePath: file.path },
        });
        stableKeyByDeclaration.set(declaration, stableKey);
        const content = declaration.getText(source);
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
      }
    });
    const visitCalls = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        const localName = ts.isIdentifier(expression)
          ? expression.text
          : ts.isPropertyAccessExpression(expression) &&
              ts.isIdentifier(expression.expression)
            ? expression.expression.text
            : null;
        const memberName =
          ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.expression)
            ? expression.name.text
            : undefined;
        if (localName) {
          let parent: ts.Node | undefined = node.parent;
          let sourceSymbolStableKey: string | undefined;
          while (parent && parent !== source) {
            sourceSymbolStableKey = stableKeyByDeclaration.get(parent);
            if (sourceSymbolStableKey) break;
            parent = parent.parent;
          }
          calls.push({
            localName,
            ...(memberName ? { memberName } : {}),
            line: range(source, node).lineStart,
            ...(sourceSymbolStableKey ? { sourceSymbolStableKey } : {}),
          });
        }
      }
      ts.forEachChild(node, visitCalls);
    };
    visitCalls(source);

    return {
      ...file,
      imports,
      calls,
      exports: [...new Set(exports)],
      symbols,
      chunks: chunks.length ? chunks : lineChunks(file, imports, exports),
    };
  }
}
