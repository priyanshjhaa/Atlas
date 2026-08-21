import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArchitecturePage, GraphPage } from "@/components/features/explore";
import type {
  AtlasArchitectureSnapshot,
  AtlasGraph,
  AtlasRepository,
  AtlasWorkspace,
} from "@/lib/api-types";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/graph",
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/atlas-graph", () => ({
  AtlasGraph: ({ onNodeSelect }: { onNodeSelect?: (nodeId: string) => void }) => (
    <div data-testid="engineering-graph">
      <button onClick={() => onNodeSelect?.("file-1")}>Select API file</button>
    </div>
  ),
}));

const workspace: AtlasWorkspace = {
  id: "workspace-1",
  name: "Atlas Engineering",
  slug: "atlas-engineering",
  role: "owner",
  repositoryCount: 1,
  onboardingCompletedAt: "2026-08-01T00:00:00.000Z",
};

const repositories: AtlasRepository[] = [
  {
    id: "repository-1",
    owner: "atlas",
    name: "web",
    defaultBranch: "main",
    isPrivate: true,
    isActive: true,
    lastSyncedAt: "2026-08-20T10:00:00.000Z",
  },
];

const graph: AtlasGraph = {
  rootEntityId: "repository-root",
  depth: 3,
  direction: "both",
  includeHistorical: false,
  includeInferred: true,
  truncated: false,
  nodes: [
    {
      id: "repository-root",
      repositoryId: "repository-1",
      repository: "atlas/web",
      entityType: "repository",
      stableKey: "repository",
      name: "web",
      path: null,
      sourceRevision: "abcdef1234567890",
      metadata: {},
      isCurrent: true,
    },
    {
      id: "file-1",
      repositoryId: "repository-1",
      repository: "atlas/web",
      entityType: "file",
      stableKey: "src/api.ts",
      name: "api.ts",
      path: "src/api.ts",
      sourceRevision: "abcdef1234567890",
      metadata: {},
      isCurrent: true,
    },
  ],
  edges: [
    {
      id: "edge-1",
      sourceEntityId: "repository-root",
      targetEntityId: "file-1",
      kind: "contains",
      classification: "observed",
      provenance: "indexed_repository",
      confidence: 1,
      sourceRevision: "abcdef1234567890",
      targetRevision: "abcdef1234567890",
      evidence: {},
      isCurrent: true,
      hop: 1,
    },
  ],
};

const architecture: AtlasArchitectureSnapshot = {
  id: "snapshot-1",
  workspaceId: workspace.id,
  repositoryId: "repository-1",
  sourceRevision: "abcdef1234567890",
  summary: "Atlas web contains two observed module areas.",
  diagram: "flowchart LR",
  generatedAt: "2026-08-20T10:00:00.000Z",
  moduleMap: {
    readiness: "complete",
    generatedFrom: "observed_static_analysis",
    moduleNodes: [
      { id: "src/api", label: "Src / Api", kind: "service" },
      { id: "src/data", label: "Src / Data", kind: "module" },
    ],
    moduleEdges: [
      { from: "src/api", to: "src/data", type: "imports", confidence: 1, provenance: "typescript_static_import" },
    ],
    entryPoints: ["src/main.ts"],
    recommendedReads: ["src/api/controller.ts"],
    stats: {
      filesIndexed: 12,
      symbolsExtracted: 38,
      callsDetected: 17,
      relationshipsObserved: 9,
      crossModuleEdges: 1,
      rootDirectories: ["src"],
      typeChecker: null,
      workspace: null,
    },
  },
};

describe("engineering explorer", () => {
  it("exposes traversal controls and lets a graph node become the new focus", () => {
    render(
      <GraphPage
        workspace={workspace}
        repositories={repositories}
        graph={graph}
        selectedRepositoryId="repository-1"
        traversal={{ depth: 3, direction: "both", includeHistorical: false, includeInferred: true }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Trace how Atlas Engineering works" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3 hops" })).toHaveClass("active");
    expect(document.body).not.toHaveTextContent("undefined");
    expect(screen.getByRole("button", { name: "Simple view" })).toHaveClass("active");
    expect(screen.getByRole("heading", { name: "What uses this" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What this uses" })).toBeInTheDocument();
    expect(screen.getByText("Contains")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /api.ts/ }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Full map" }));
    fireEvent.click(screen.getByRole("button", { name: "Select API file" }));
    expect(screen.getByRole("heading", { name: "api.ts" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Explore from this entity/ }));
    expect(replace).toHaveBeenCalledWith("/app/graph?entity=file-1");
  });

  it("turns the architecture snapshot into an inspectable module and reading map", () => {
    render(
      <ArchitecturePage
        workspace={workspace}
        repositories={repositories}
        selectedRepositoryId="repository-1"
        architectureSnapshot={architecture}
      />,
    );

    expect(screen.getByRole("heading", { name: "Understand how Atlas Engineering is assembled" })).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("src/main.ts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open dependency graph/ })).toHaveAttribute(
      "href",
      "/app/graph?repository=repository-1",
    );
    fireEvent.click(screen.getByRole("button", { name: /Module Src \/ Data/ }));
    expect(screen.getByRole("heading", { name: "Src / Data" })).toBeInTheDocument();
    expect(screen.getByText("Used by")).toBeInTheDocument();
  });
});
