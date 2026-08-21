"use client";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
} from "@xyflow/react";
import type { Edge, Node, NodeProps } from "@xyflow/react";
import {
  Boxes,
  Braces,
  FileCode2,
  FolderTree,
  GitBranch,
  Package,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import type { AtlasGraph as AtlasGraphData } from "@/lib/api-types";

type GraphNodeData = {
  entityType: string;
  name: string;
  path: string | null;
  repository: string;
  relationshipCount: number;
  isRoot: boolean;
  isCurrent: boolean;
};

type ExplorerNode = Node<GraphNodeData, "atlasEntity">;

function readable(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function repositoryLabel(node: AtlasGraphData["nodes"][number]) {
  if (node.repository) return node.repository;
  if (node.repositoryOwner && node.repositoryName) {
    return `${node.repositoryOwner}/${node.repositoryName}`;
  }
  return "Repository";
}

function EntityIcon({ entityType }: { entityType: string }) {
  if (entityType === "repository") return <GitBranch size={15} />;
  if (entityType === "package") return <Package size={15} />;
  if (entityType === "file") return <FileCode2 size={15} />;
  if (entityType === "folder" || entityType === "directory") return <FolderTree size={15} />;
  if (entityType === "symbol" || entityType === "function") return <Braces size={15} />;
  return <Boxes size={15} />;
}

function AtlasEntityNode({ data, selected }: NodeProps<ExplorerNode>) {
  return (
    <div className="graph-entity-node">
      <Handle className="graph-node-handle" type="target" position={Position.Left} />
      <div className="graph-entity-node__icon"><EntityIcon entityType={data.entityType} /></div>
      <div className="graph-entity-node__copy">
        <span>{data.isRoot ? "Focus" : readable(data.entityType)}</span>
        <strong>{data.name}</strong>
        <small>{data.path ?? data.repository}</small>
      </div>
      <b aria-label={`${data.relationshipCount} relationships`}>
        {data.relationshipCount}
      </b>
      {selected && <i aria-hidden="true" />}
      <Handle className="graph-node-handle" type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { atlasEntity: AtlasEntityNode };

function graphPositions(graph: AtlasGraphData) {
  const placement = new Map<string, { hop: number; side: -1 | 0 | 1 }>([
    [graph.rootEntityId, { hop: 0, side: 0 }],
  ]);

  for (let pass = 0; pass < graph.depth + 1; pass += 1) {
    for (const edge of graph.edges) {
      const source = placement.get(edge.sourceEntityId);
      const target = placement.get(edge.targetEntityId);
      if (source && !target) {
        placement.set(edge.targetEntityId, {
          hop: Math.min(graph.depth, Math.max(1, source.hop + 1)),
          side: source.side === -1 ? -1 : 1,
        });
      } else if (target && !source) {
        placement.set(edge.sourceEntityId, {
          hop: Math.min(graph.depth, Math.max(1, target.hop + 1)),
          side: target.side === 1 ? 1 : -1,
        });
      }
    }
  }

  for (const node of graph.nodes) {
    if (!placement.has(node.id)) {
      placement.set(node.id, { hop: Math.max(1, graph.depth), side: 1 });
    }
  }

  const groups = new Map<string, string[]>();
  for (const [id, value] of placement) {
    if (!value.side) continue;
    const key = `${value.side}:${value.hop}`;
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }

  const positions = new Map<string, { x: number; y: number }>([
    [graph.rootEntityId, { x: 0, y: 0 }],
  ]);
  for (const [key, ids] of groups) {
    const [sideValue, hopValue] = key.split(":").map(Number);
    const verticalGap = ids.length > 8 ? 96 : 124;
    ids.forEach((id, index) => {
      positions.set(id, {
        x: sideValue * hopValue * 310,
        y: (index - (ids.length - 1) / 2) * verticalGap,
      });
    });
  }
  return positions;
}

function graphElements(
  graph: AtlasGraphData | null,
  selectedNodeId?: string | null,
): { nodes: ExplorerNode[]; edges: Edge[] } {
  if (!graph) return { nodes: [], edges: [] };

  const positions = graphPositions(graph);
  const selectedEdgeIds = new Set(
    selectedNodeId
      ? graph.edges
          .filter(
            (edge) =>
              edge.sourceEntityId === selectedNodeId ||
              edge.targetEntityId === selectedNodeId,
          )
          .map((edge) => edge.id)
      : [],
  );
  const selectedNeighborIds = new Set<string>();
  for (const edge of graph.edges) {
    if (!selectedEdgeIds.has(edge.id)) continue;
    selectedNeighborIds.add(edge.sourceEntityId);
    selectedNeighborIds.add(edge.targetEntityId);
  }

  return {
    nodes: graph.nodes.map((node) => {
      const relationshipCount = graph.edges.filter(
        (edge) => edge.sourceEntityId === node.id || edge.targetEntityId === node.id,
      ).length;
      const muted = Boolean(
        selectedNodeId &&
          node.id !== selectedNodeId &&
          !selectedNeighborIds.has(node.id),
      );
      return {
        id: node.id,
        type: "atlasEntity",
        position: positions.get(node.id) ?? { x: 0, y: 0 },
        data: {
          entityType: node.entityType,
          name: node.entityType === "repository" ? repositoryLabel(node) : node.name,
          path: node.path,
          repository: repositoryLabel(node),
          relationshipCount,
          isRoot: node.id === graph.rootEntityId,
          isCurrent: node.isCurrent,
        },
        className: [
          "graph-node",
          node.id === graph.rootEntityId ? "graph-node--root" : "",
          node.id === selectedNodeId ? "graph-node--selected" : "",
          !node.isCurrent ? "graph-node--historical" : "",
          muted ? "graph-node--muted" : "",
        ].filter(Boolean).join(" "),
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    }),
    edges: graph.edges.map((edge) => {
      const active = !selectedNodeId || selectedEdgeIds.has(edge.id);
      return {
        id: edge.id,
        source: edge.sourceEntityId,
        target: edge.targetEntityId,
        type: "smoothstep",
        label: active && graph.edges.length <= 18 ? readable(edge.kind) : undefined,
        animated: active && edge.classification === "inferred",
        className: [
          "graph-edge",
          `graph-edge--${edge.classification}`,
          active ? "graph-edge--active" : "graph-edge--muted",
        ].join(" "),
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        style: { opacity: active ? Math.max(0.62, edge.confidence) : 0.12 },
      };
    }),
  };
}

export function AtlasGraph({
  compact = false,
  graph = null,
  selectedNodeId = null,
  onNodeSelect,
}: {
  compact?: boolean;
  graph?: AtlasGraphData | null;
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string) => void;
}) {
  const elements = graphElements(graph, selectedNodeId);
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
        key={`${graph?.rootEntityId ?? "repositories"}:${elements.nodes.map((node) => node.id).join(",")}`}
        nodes={elements.nodes}
        edges={elements.edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: compact ? 0.16 : 0.22, maxZoom: 1.15 }}
        minZoom={0.35}
        maxZoom={1.55}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={!compact}
        onNodeClick={onNodeSelect ? (_event, node) => onNodeSelect(node.id) : undefined}
        onPaneClick={
          onNodeSelect && graph
            ? () => onNodeSelect(graph.rootEntityId)
            : undefined
        }
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(82, 100, 78, .13)" gap={28} size={1} />
        {!compact && <Controls showInteractive={false} />}
        {!compact && (
          <MiniMap
            pannable
            zoomable
            nodeStrokeWidth={2}
            nodeColor={(node) => node.id === graph?.rootEntityId ? "#b76548" : "#6d8667"}
            maskColor="rgba(244, 240, 222, .72)"
          />
        )}
      </ReactFlow>
    </div>
  );
}
