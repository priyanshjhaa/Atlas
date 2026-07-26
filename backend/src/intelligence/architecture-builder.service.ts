import { Injectable } from "@nestjs/common";
import { dirname } from "node:path/posix";
import type {
  ArchitectureSnapshotData,
  ObservedRelationship,
  ParsedFile,
} from "./intelligence.types";

interface ModuleNode {
  id: string;
  label: string;
  kind: "folder" | "module" | "service";
}

interface ModuleEdge {
  from: string;
  to: string;
  type: "imports";
  confidence: number;
  provenance: string;
}

function moduleForPath(path: string) {
  const parts = path.split("/");
  if (parts.length === 1) return "root";
  if (parts[0] === "src" && parts[1]) return `src/${parts[1]}`;
  if (["apps", "packages"].includes(parts[0]) && parts[1]) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

function label(value: string) {
  if (value === "root") return "Root";
  return value
    .split("/")
    .map((part) => part.replace(/[-_]/g, " "))
    .join(" / ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function mermaidId(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "_") || "root";
}

@Injectable()
export class ArchitectureBuilderService {
  build(
    repositoryName: string,
    files: ParsedFile[],
    relationships: ObservedRelationship[],
  ): ArchitectureSnapshotData {
    const moduleIds = [...new Set(files.map((file) => moduleForPath(file.path)))]
      .sort()
      .slice(0, 24);
    const nodes: ModuleNode[] = moduleIds.map((id) => ({
      id,
      label: label(id),
      kind: /(service|controller|route|repository)s?$/i.test(id)
        ? "service"
        : id.includes("/")
          ? "module"
          : "folder",
    }));
    const edgesByKey = new Map<string, ModuleEdge>();
    for (const relationship of relationships) {
      const from = moduleForPath(relationship.sourcePath);
      const to = moduleForPath(relationship.targetPath);
      if (from === to) continue;
      const key = `${from}->${to}`;
      edgesByKey.set(key, {
        from,
        to,
        type: "imports",
        confidence: relationship.confidence,
        provenance: relationship.provenance,
      });
    }
    const edges = [...edgesByKey.values()].slice(0, 48);
    const entryPoints = files
      .map((file) => file.path)
      .filter((path) =>
        /(^|\/)(README\.md|package\.json|main|server|index|middleware|routes|controllers|app)\b/i.test(
          path,
        ),
      )
      .slice(0, 10);
    const exportedSymbols = files.reduce(
      (count, file) =>
        count + file.symbols.filter((symbol) => symbol.exported).length,
      0,
    );
    const languages = [...new Set(files.map((file) => file.language))].sort();
    const visibleNodes = nodes.slice(0, 12);
    const visible = new Set(visibleNodes.map((node) => node.id));
    const diagram = [
      "flowchart LR",
      ...visibleNodes.map(
        (node) => `  ${mermaidId(node.id)}["${node.label}"]`,
      ),
      ...edges
        .filter((edge) => visible.has(edge.from) && visible.has(edge.to))
        .slice(0, 18)
        .map(
          (edge) =>
            `  ${mermaidId(edge.from)} --> ${mermaidId(edge.to)}`,
        ),
    ].join("\n");

    return {
      summary: `${repositoryName} contains ${files.length} indexed files across ${languages.join(", ")} with ${nodes.length} module areas and ${edges.length} observed cross-module imports.`,
      diagram,
      moduleMap: {
        readiness:
          files.length >= 3 && exportedSymbols >= 3 ? "complete" : "partial",
        generatedFrom: "observed_static_analysis",
        moduleNodes: nodes,
        moduleEdges: edges,
        entryPoints,
        recommendedReads: [
          ...new Set([
            ...entryPoints,
            ...files
              .filter((file) => file.symbols.some((symbol) => symbol.exported))
              .map((file) => file.path),
          ]),
        ].slice(0, 10),
        stats: {
          filesIndexed: files.length,
          symbolsExtracted: files.reduce(
            (count, file) => count + file.symbols.length,
            0,
          ),
          relationshipsObserved: relationships.length,
          crossModuleEdges: edges.length,
          rootDirectories: [
            ...new Set(files.map((file) => dirname(file.path).split("/")[0])),
          ],
        },
      },
    };
  }
}
