"use client";

import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { graphEdges, graphNodes } from "../lib/mock-data";

export function AtlasGraph({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "atlas-graph atlas-graph--compact" : "atlas-graph"}>
      <ReactFlow
        nodes={graphNodes}
        edges={graphEdges}
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
