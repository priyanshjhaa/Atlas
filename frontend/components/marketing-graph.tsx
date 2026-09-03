"use client";

import { Background, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { graphEdges, graphNodes } from "@/lib/marketing-demo-data";

export function MarketingGraph() {
  return (
    <div className="atlas-graph atlas-graph--compact">
      <ReactFlow
        nodes={graphNodes}
        edges={graphEdges}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.45}
        maxZoom={1.8}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(255,255,255,.09)" gap={24} size={1} />
      </ReactFlow>
    </div>
  );
}
