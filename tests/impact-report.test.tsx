import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImpactReportPage } from "@/components/features/impact";
import type { AtlasImpactReport } from "@/lib/api-types";

const report: AtlasImpactReport = {
  id: "01951ca1-2c72-7000-8000-000000000001",
  workspaceId: "01951ca1-2c72-7000-8000-000000000002",
  repositoryId: "01951ca1-2c72-7000-8000-000000000003",
  requestedByUserId: "user-1",
  sourceRevision: "abcdef1234567890",
  input: {
    mode: "planned",
    repositoryId: "01951ca1-2c72-7000-8000-000000000003",
    description: "Change session validation.",
    scope: "repository",
    anchors: ["validateSession"],
  },
  result: {
    title: "Change session validation",
    status: "complete",
    answer:
      "The change is anchored in lib/auth.ts and affects app/layout.tsx.",
    executiveSummary:
      "Atlas resolved one candidate anchor and one observed consumer.",
    risk: {
      level: "medium",
      score: 42,
      reasons: ["1 indexed modification anchor resolved"],
    },
    repository: {
      id: "01951ca1-2c72-7000-8000-000000000003",
      owner: "atlas",
      name: "web",
      defaultBranch: "main",
    },
    sourceRevision: "abcdef1234567890",
    scope: "repository",
    resolvedEntities: [
      {
        id: "symbol-1",
        kind: "symbol",
        name: "validateSession",
        filePath: "lib/auth.ts",
        lineStart: 10,
        lineEnd: 20,
        confidence: 0.88,
      },
    ],
    directImpacts: [
      {
        id: "direct-1",
        classification: "direct",
        kind: "Symbol",
        title: "validateSession · lib/auth.ts",
        detail: "Matched the planned change.",
        repositoryId: "01951ca1-2c72-7000-8000-000000000003",
        repository: "atlas/web",
        filePath: "lib/auth.ts",
        symbol: "validateSession",
        hop: 0,
        confidence: 0.88,
        provenance: "indexed_source_chunk",
        evidenceIds: ["chunk-1"],
      },
    ],
    downstreamImpacts: [
      {
        id: "downstream-1",
        classification: "downstream",
        kind: "Consumer",
        title: "app/layout.tsx",
        detail: "Imports lib/auth.ts.",
        repositoryId: "01951ca1-2c72-7000-8000-000000000003",
        repository: "atlas/web",
        filePath: "app/layout.tsx",
        hop: 1,
        confidence: 1,
        provenance: "typescript_static_import",
        evidenceIds: ["relationship-1"],
      },
    ],
    unknownImpacts: [],
    evidence: [
      {
        id: "relationship-1",
        repositoryId: "01951ca1-2c72-7000-8000-000000000003",
        repository: "atlas/web",
        filePath: "app/layout.tsx",
        lineStart: 4,
        lineEnd: 4,
        excerpt: "Imports validateSession from lib/auth.ts.",
        provenance: "typescript_static_import",
        sourceRevision: "abcdef1234567890",
      },
    ],
    relationshipPath: [
      { repository: "web", filePath: "lib/auth.ts", hop: 0 },
      { repository: "web", filePath: "app/layout.tsx", hop: 1 },
    ],
    recommendations: [
      "Preserve the authentication contract used by app/layout.tsx.",
    ],
    verificationPlan: ["Run the authentication integration tests."],
    limitations: ["Static imports only."],
    generatedAt: "2026-07-29T12:00:00.000Z",
  },
  createdAt: "2026-07-29T12:00:00.000Z",
  updatedAt: "2026-07-29T12:00:00.000Z",
};

describe("ImpactReportPage", () => {
  it("renders persisted findings, citations, and limitations", () => {
    render(<ImpactReportPage report={report} />);

    expect(
      screen.getByRole("heading", { name: "Change session validation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("validateSession · lib/auth.ts")).toBeVisible();
    expect(screen.getByText("app/layout.tsx", { selector: "h3" })).toBeVisible();
    expect(screen.getByText(/typescript static import/i)).toBeVisible();
    expect(screen.getByText("Static imports only.")).toBeVisible();
    expect(
      screen.getByText(/change is anchored in lib\/auth\.ts/i),
    ).toBeVisible();
    expect(
      screen.getByText(/Preserve the authentication contract/i),
    ).toBeVisible();
  });
});
