import { Injectable, NotFoundException } from "@nestjs/common";
import { IntelligenceRepository } from "./intelligence.repository";

export interface GraphTraversalOptions {
  entityId?: string;
  depth: number;
  direction: "incoming" | "outgoing" | "both";
  includeHistorical: boolean;
  includeInferred: boolean;
}

export interface GraphTraversalEdge {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  kind: string;
  classification: "observed" | "historical" | "inferred";
  provenance: string;
  confidence: number;
  sourceRevision: string;
  targetRevision: string;
  evidence: Record<string, unknown>;
  isCurrent: boolean;
}

const MAX_GRAPH_NODES = 200;
const MAX_GRAPH_EDGES = 400;

@Injectable()
export class GraphTraversalService {
  constructor(private readonly repository: IntelligenceRepository) {}

  async traverse(
    workspaceId: string,
    repositoryId: string,
    options: GraphTraversalOptions,
  ) {
    const seed = await this.repository.graphSeed(
      workspaceId,
      repositoryId,
      options.entityId,
      options.includeHistorical,
    );
    if (!seed) {
      throw new NotFoundException(
        options.entityId
          ? "Graph entity not found in this repository."
          : "No graph exists. Synchronize the repository first.",
      );
    }

    const seenNodeIds = new Set([seed.id]);
    const seenEdgeIds = new Set<string>();
    const traversedEdges: Array<GraphTraversalEdge & { hop: number }> = [];
    let frontier = [seed.id];
    let truncated = false;

    for (
      let hop = 1;
      hop <= options.depth && frontier.length;
      hop += 1
    ) {
      const remainingEdges = MAX_GRAPH_EDGES - traversedEdges.length;
      if (remainingEdges <= 0 || seenNodeIds.size >= MAX_GRAPH_NODES) {
        truncated = true;
        break;
      }
      const edges = await this.repository.graphEdges(
        workspaceId,
        frontier,
        options.direction,
        options.includeHistorical,
        options.includeInferred,
        remainingEdges,
      );
      if (edges.length >= remainingEdges) truncated = true;
      const nextFrontier = new Set<string>();
      for (const edge of edges) {
        if (seenEdgeIds.has(edge.id)) continue;
        const candidateIds =
          options.direction === "outgoing"
            ? [edge.targetEntityId]
            : options.direction === "incoming"
              ? [edge.sourceEntityId]
              : [edge.sourceEntityId, edge.targetEntityId];
        for (const entityId of candidateIds) {
          if (seenNodeIds.has(entityId)) continue;
          if (seenNodeIds.size >= MAX_GRAPH_NODES) {
            truncated = true;
            break;
          }
          seenNodeIds.add(entityId);
          nextFrontier.add(entityId);
        }
        seenEdgeIds.add(edge.id);
        traversedEdges.push({ ...edge, hop });
        if (traversedEdges.length >= MAX_GRAPH_EDGES) {
          truncated = true;
          break;
        }
      }
      frontier = [...nextFrontier];
    }

    const nodes = await this.repository.graphNodes(
      workspaceId,
      [...seenNodeIds],
    );
    const authorizedNodeIds = new Set(nodes.map((node) => node.id));
    const edges = traversedEdges.filter(
      (edge) =>
        authorizedNodeIds.has(edge.sourceEntityId) &&
        authorizedNodeIds.has(edge.targetEntityId),
    );
    return {
      rootEntityId: seed.id,
      depth: options.depth,
      direction: options.direction,
      includeHistorical: options.includeHistorical,
      includeInferred: options.includeInferred,
      truncated:
        truncated ||
        nodes.length < seenNodeIds.size ||
        edges.length < traversedEdges.length,
      nodes,
      edges,
    };
  }
}
