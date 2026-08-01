"use client";

import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type {
  AtlasGraph as AtlasGraphData,
  AtlasRepository,
} from "@/lib/api-types";

function graphElements(
  graph: AtlasGraphData | null,
  repositories: AtlasRepository[],
): { nodes: Node[]; edges: Edge[] } {
  if (graph) {
    return {
      nodes: graph.nodes.map((node, index) => ({
        id: node.id,
        position: {
          x: (index % 4) * 230,
          y: Math.floor(index / 4) * 145,
        },
        data: {
          label:
            node.entityType === "repository"
              ? `${node.repositoryOwner}/${node.repositoryName}`
              : node.name,
        },
        className: `graph-node graph-node--${node.entityType}`,
      })),
      edges: graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.sourceEntityId,
        target: edge.targetEntityId,
        label: edge.kind.replaceAll("_", " "),
        animated: edge.classification === "inferred",
        className: `graph-edge graph-edge--${edge.classification}`,
      })),
    };
  }

  return {
    nodes: repositories.map((repository, index) => ({
      id: repository.id,
      position: {
        x: (index % 3) * 250,
        y: Math.floor(index / 3) * 150,
      },
      data: { label: `${repository.owner}/${repository.name}` },
      className: "graph-node graph-node--repository",
    })),
    edges: [],
  };
}

export function AtlasGraph({
  compact = false,
  graph = null,
  repositories = [],
}: {
  compact?: boolean;
  graph?: AtlasGraphData | null;
  repositories?: AtlasRepository[];
}) {
  const elements = graphElements(graph, repositories);
  if (!elements.nodes.length) {
    return (
      <div className={compact ? "atlas-graph atlas-graph--compact" : "atlas-graph"}>
        <div className="empty-state">
          <h2>No indexed graph yet</h2>
          <p>Connect and synchronize a repository to build this view.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "atlas-graph atlas-graph--compact" : "atlas-graph"}>
      <ReactFlow
        nodes={elements.nodes}
        edges={elements.edges}
        fitView
        fitViewOptions={{ padding: compact ? 0.18 : 0.28 }}
        minZoom={0.45}
        maxZoom={1.8}
        nodesDraggable={!compact}
        nodesConnectable={false}
        elementsSelectable={!compact}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(255,255,255,.09)" gap={24} size={1} />
        {!compact && <Controls showInteractive={false} />}
        {!compact && <MiniMap pannable zoomable nodeStrokeWidth={3} />}
      </ReactFlow>
    </div>
  );
}
