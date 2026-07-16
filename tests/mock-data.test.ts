import { describe, expect, it } from "vitest";
import { directImpacts, downstreamImpacts, graphEdges, graphNodes, repositories } from "../lib/mock-data";

describe("Atlas mock workspace", () => {
  it("keeps the impact report connected to the shared repository fixture", () => {
    const repositoryNames = repositories.map((repository) => repository.name);
    expect(repositoryNames).toContain("identity-service");
    expect(repositoryNames).toContain("api-gateway");
    expect(directImpacts).toHaveLength(3);
    expect(downstreamImpacts.some((impact) => impact.confidence === "inferred")).toBe(true);
  });

  it("contains only graph edges with valid endpoints", () => {
    const nodeIds = new Set(graphNodes.map((node) => node.id));
    expect(graphEdges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))).toBe(true);
  });
});
