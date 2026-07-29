import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("supports legacy reports with the deterministic fallback", () => {
    render(<ImpactReportPage report={report} />);

    expect(
      screen.getByRole("heading", {
        name: "Enhanced explanation unavailable. Showing the verified Atlas analysis.",
      }),
    ).toBeVisible();
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

  it("separates a generated explanation from verified findings and links its citations", () => {
    const explainedReport: AtlasImpactReport = {
      ...report,
      explanation: {
        status: "completed",
        schemaVersion: "1",
        explanation: {
          schemaVersion: "1",
          executiveSummary:
            "The session validation contract has one observed application consumer.",
          answer: "Update the validator while preserving its import contract.",
          claims: [
            {
              text: "The application layout imports the session validator.",
              evidenceIds: ["relationship-1"],
            },
          ],
          implementationSteps: [
            {
              title: "Preserve the exported contract",
              detail: "Keep the imported validator compatible with its consumer.",
              evidenceIds: ["relationship-1"],
            },
          ],
          verificationSteps: [
            {
              text: "Exercise the application layout authentication path.",
              evidenceIds: ["relationship-1"],
            },
          ],
          remainingQuestions: [
            "Are there runtime consumers outside static imports?",
          ],
        },
        metadata: {
          provider: "groq",
          model: "test-model",
          promptVersion: "1",
          outputSchemaVersion: "1",
          evidencePacketHash: "packet-hash",
          sourceRevision: "abcdef1234567890",
          generatedAt: "2026-07-29T12:00:01.000Z",
          latencyMs: 250,
          usage: {
            inputTokens: 100,
            outputTokens: 80,
            totalTokens: 180,
          },
          validationStatus: "valid",
          failureCode: null,
          deterministicFallback: false,
        },
      },
    };

    render(<ImpactReportPage report={explainedReport} />);

    expect(screen.getByText("AI explanation")).toBeVisible();
    expect(
      screen.getByText(/model did not scan the repository/i),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Implementation guidance" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Verification guidance" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Remaining questions" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Verified limitations" }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("link", {
        name: "View evidence from app/layout.tsx line 4",
      })[0],
    ).toHaveAttribute("href", "#evidence-relationship-1");
    expect(
      screen.getByText(/change is anchored in lib\/auth\.ts/i),
    ).toBeVisible();
  });

  it("retries a failed explanation without hiding the verified report", async () => {
    const failedReport: AtlasImpactReport = {
      ...report,
      explanation: {
        status: "failed",
        schemaVersion: "1",
        failureCode: "provider_unavailable",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...failedReport,
          explanation: {
            status: "pending",
            schemaVersion: "1",
          },
        }),
      }),
    );

    render(<ImpactReportPage report={failedReport} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry explanation" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: "Enhanced explanation is being generated.",
        }),
      ).toBeVisible();
    });
    expect(screen.getByText("validateSession · lib/auth.ts")).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      `/api/impact-reports/${report.id}/explanation/retry`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});
