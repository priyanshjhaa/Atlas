import { describe, expect, it } from "vitest";
import { graphEdges, graphNodes } from "../lib/marketing-demo-data";

describe("Atlas marketing topology", () => {
  it("contains only graph edges with valid endpoints", () => {
    const nodeIds = new Set(graphNodes.map((node) => node.id));
    expect(graphEdges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))).toBe(true);
  });
});
