import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { GraphTraversalService } from "../src/intelligence/graph-traversal.service";
import type { IntelligenceRepository } from "../src/intelligence/intelligence.repository";

function setup() {
  const repository = {
    graphSeed: vi.fn().mockResolvedValue({
      id: "entity-repository",
      repositoryId: "repository-1",
      entityType: "repository",
      stableKey: "repository",
    }),
    graphEdges: vi.fn(
      async (_workspaceId: string, frontier: string[]) => {
        if (frontier.includes("entity-repository")) {
          return [
            {
              id: "edge-contains",
              sourceEntityId: "entity-repository",
              targetEntityId: "entity-file",
              kind: "contains",
              classification: "observed" as const,
              provenance: "repository_index_membership",
              confidence: 1,
              sourceRevision: "revision-1",
              targetRevision: "revision-1",
              evidence: { path: "src/api.ts" },
              isCurrent: true,
            },
          ];
        }
        if (frontier.includes("entity-file")) {
          return [
            {
              id: "edge-inferred",
              sourceEntityId: "entity-file",
              targetEntityId: "entity-symbol",
              kind: "references_symbol",
              classification: "inferred" as const,
              provenance: "typescript_import_binding_inference",
              confidence: 0.7,
              sourceRevision: "revision-1",
              targetRevision: "revision-1",
              evidence: { importedName: "refreshSession" },
              isCurrent: true,
            },
          ];
        }
        return [];
      },
    ),
    graphNodes: vi.fn(
      async (_workspaceId: string, entityIds: string[]) =>
        entityIds.map((id) => ({
          id,
          repositoryId: "repository-1",
          repository: "atlas/core",
          entityType:
            id === "entity-repository"
              ? "repository"
              : id === "entity-symbol"
                ? "symbol"
                : "file",
          stableKey: id,
          name: id,
          path: id === "entity-repository" ? null : "src/api.ts",
          sourceRevision: "revision-1",
          metadata: {},
          isCurrent: true,
        })),
    ),
  };
  return {
    repository,
    service: new GraphTraversalService(
      repository as unknown as IntelligenceRepository,
    ),
  };
}

describe("GraphTraversalService", () => {
  it("performs a bounded breadth-first traversal and preserves edge classification", async () => {
    const { repository, service } = setup();
    const result = await service.traverse(
      "workspace-1",
      "repository-1",
      {
        depth: 2,
        direction: "both",
        includeHistorical: false,
        includeInferred: true,
      },
    );

    expect(result).toMatchObject({
      rootEntityId: "entity-repository",
      depth: 2,
      direction: "both",
      includeHistorical: false,
      includeInferred: true,
      truncated: false,
    });
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toEqual([
      expect.objectContaining({
        id: "edge-contains",
        classification: "observed",
        hop: 1,
      }),
      expect.objectContaining({
        id: "edge-inferred",
        classification: "inferred",
        confidence: 0.7,
        hop: 2,
      }),
    ]);
    expect(repository.graphEdges).toHaveBeenNthCalledWith(
      1,
      "workspace-1",
      ["entity-repository"],
      "both",
      false,
      true,
      400,
    );
  });

  it("rejects a seed that is not authorized for the selected repository", async () => {
    const { repository, service } = setup();
    repository.graphSeed.mockResolvedValue(null);

    await expect(
      service.traverse("workspace-1", "repository-1", {
        entityId: "foreign-entity",
        depth: 1,
        direction: "outgoing",
        includeHistorical: false,
        includeInferred: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.graphEdges).not.toHaveBeenCalled();
    expect(repository.graphNodes).not.toHaveBeenCalled();
  });

  it("drops edges whose endpoint repositories are no longer active", async () => {
    const { repository, service } = setup();
    repository.graphNodes.mockImplementation(
      async (_workspaceId: string, entityIds: string[]) =>
        entityIds
          .filter((id) => id !== "entity-symbol")
          .map((id) => ({
            id,
            repositoryId: "repository-1",
            repository: "atlas/core",
            entityType: "file",
            stableKey: id,
            name: id,
            path: "src/api.ts",
            sourceRevision: "revision-1",
            metadata: {},
            isCurrent: true,
          })),
    );

    const result = await service.traverse(
      "workspace-1",
      "repository-1",
      {
        depth: 2,
        direction: "both",
        includeHistorical: true,
        includeInferred: true,
      },
    );

    expect(result.truncated).toBe(true);
    expect(result.edges.map((edge) => edge.id)).toEqual([
      "edge-contains",
    ]);
  });
});
