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
    const { rerender } = render(<ImpactReportPage report={report} />);

    expect(screen.getByRole("heading", { name: "Bottom line" })).toBeVisible();
    expect(
      screen.getByText(/assembled directly from the source-backed report/i),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry briefing" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Change session validation" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Verified Atlas report" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Atlas report/i }));
    expect(
      screen.getByText(/change is anchored in lib\/auth\.ts/i),
    ).toBeVisible();
    expect(screen.getByLabelText("Change risk")).toBeVisible();
    expect(
      screen.getByText("Medium", { selector: ".risk-score strong" }),
    ).toBeVisible();
    expect(screen.queryByText("42/100")).not.toBeInTheDocument();

    rerender(<ImpactReportPage report={report} view="findings" />);

    expect(screen.getByText("validateSession · lib/auth.ts")).toBeVisible();
    expect(screen.getByText("app/layout.tsx", { selector: "h3" })).toBeVisible();

    rerender(<ImpactReportPage report={report} view="evidence" />);

    expect(screen.getByText(/typescript static import/i)).toBeVisible();
    expect(screen.getByText("Static imports only.")).toBeVisible();

    rerender(<ImpactReportPage report={report} view="plan" />);

    expect(
      screen.getByText(/Preserve the authentication contract/i),
    ).toBeVisible();
  });

  it("shows pull-request authors, latest reviewer states, and merger", () => {
    const pullRequestReport: AtlasImpactReport = {
      ...report,
      input: {
        ...report.input,
        mode: "pull-request",
        pullRequest: {
          number: 42,
          title: "Change session validation",
          url: "https://github.com/atlas/web/pull/42",
          author: "engineer",
          authorDetails: {
            providerUserId: "U_engineer",
            login: "engineer",
            displayName: "Atlas Engineer",
            avatarUrl: null,
            profileUrl: "https://github.com/engineer",
            kind: "person",
          },
          reviewers: [
            {
              actor: {
                providerUserId: "U_reviewer",
                login: "reviewer",
                displayName: null,
                avatarUrl: null,
                profileUrl: "https://github.com/reviewer",
                kind: "person",
              },
              state: "APPROVED",
              submittedAt: "2026-08-02T00:00:00.000Z",
              url: "https://github.com/atlas/web/pull/42#pullrequestreview-2",
            },
          ],
          mergedBy: {
            providerUserId: "U_maintainer",
            login: "maintainer",
            displayName: "Maintainer",
            avatarUrl: null,
            profileUrl: "https://github.com/maintainer",
            kind: "person",
          },
          reviewsTruncated: false,
          baseRevision: "base",
          headRevision: "head",
          changedFiles: [],
        },
      },
    };

    render(<ImpactReportPage report={pullRequestReport} />);

    expect(screen.getByText(/opened by Atlas Engineer/i)).toBeVisible();
    expect(screen.getByLabelText("Pull request provenance")).toBeVisible();
    expect(screen.getByText("reviewer")).toBeVisible();
    expect(screen.getByText("Approved")).toBeVisible();
    expect(screen.getByText("Maintainer")).toBeVisible();
    expect(screen.getByText("Merged by")).toBeVisible();
  });

  it("shows cited Notion decisions and an unavailable state without changing risk", () => {
    const documentedReport: AtlasImpactReport = {
      ...report,
      result: {
        ...report.result,
        documentationContext: {
          status: "available",
          evidence: [
            {
              id: "notion:adr-12",
              provider: "notion",
              title: "ADR 12: Session validation",
              url: "https://notion.so/adr-12",
              excerpt: "Preserve the public session validation contract.",
              sourceRevision: "notion-revision-1",
              lastEditedAt: "2026-07-28T12:00:00.000Z",
              lastEditedBy: {
                providerUserId: "notion-user-1",
                displayName: "Maya Chen",
                avatarUrl: null,
                kind: "person",
              },
              freshness: "2026-07-29T11:00:00.000Z",
              relevance: 0.87,
            },
          ],
        },
      },
    };

    const { unmount } = render(
      <ImpactReportPage report={documentedReport} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /Atlas report/i }));
    fireEvent.click(screen.getByText("Documentation context"));
    expect(screen.getByText("ADR 12: Session validation")).toBeVisible();
    expect(screen.getByText("87% relevant", { exact: false })).toBeVisible();
    expect(screen.getByText(/Edited by Maya Chen.*editor observed at sync/i)).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: /Open ADR 12: Session validation in Notion.*Edited by Maya Chen/i,
      }),
    ).toHaveAttribute("href", "https://notion.so/adr-12");
    expect(
      screen.getByText("Medium", { selector: ".risk-score strong" }),
    ).toBeVisible();

    unmount();
    render(
      <ImpactReportPage
        report={{
          ...report,
          result: {
            ...report.result,
            documentationContext: { status: "unavailable", evidence: [] },
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /Atlas report/i }));
    fireEvent.click(screen.getByText("Documentation context"));
    expect(
      screen.getByRole("heading", {
        name: "No documentation context available",
      }),
    ).toBeVisible();
  });

  it("adapts stored v1 explanations into the briefing without leaking AI prose into detail pages", () => {
    const explainedReport: AtlasImpactReport = {
      ...report,
      explanation: {
        status: "completed",
        schemaVersion: "1",
        explanation: {
          schemaVersion: "1",
          executiveSummary:
            "The session validation contract has one observed application consumer.\n\nPreserve that boundary before changing the underlying validation behavior.",
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
            {
              title: "Update the validation behavior",
              detail: "Apply the intended behavior behind the stable contract.",
              evidenceIds: ["relationship-1"],
            },
            {
              title: "Coordinate the consumer",
              detail: "Carry any deliberate contract change into the observed consumer.",
              evidenceIds: ["relationship-1"],
            },
            {
              title: "Prepare the rollout",
              detail: "Resolve the remaining runtime uncertainty before release.",
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

    const { rerender } = render(
      <ImpactReportPage report={explainedReport} />,
    );

    expect(screen.getByRole("tab", { name: /AI briefing/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("heading", { name: "Bottom line" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Practical impact" })).toBeVisible();
    expect(screen.getByText("engineering", { selector: "article span" })).toBeVisible();
    expect(screen.getByText(/Preserve the exported contract:/)).toBeVisible();
    expect(screen.getByText(/Update the validation behavior:/)).toBeVisible();
    expect(screen.getByText(/Coordinate the consumer:/)).toBeVisible();
    expect(screen.queryByText("Prepare the rollout")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Before merge" })).toBeVisible();
    expect(screen.getByText("Top unresolved question")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Verified Atlas report" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Implementation guidance" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Atlas Findings" }),
    ).toHaveAttribute(
      "href",
      `/app/impact/${explainedReport.id}/findings`,
    );
    fireEvent.click(screen.getByRole("tab", { name: /Atlas report/i }));
    expect(
      screen.getByRole("heading", { name: "Verified Atlas report" }),
    ).toBeVisible();
    expect(screen.queryByText("What this change means")).not.toBeInTheDocument();
    expect(screen.getByText(/change is anchored in lib\/auth\.ts/i)).toBeVisible();

    rerender(<ImpactReportPage report={explainedReport} view="plan" />);

    expect(screen.getByRole("heading", { name: "Recommended next steps" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Verification plan" })).toBeVisible();
    expect(screen.queryByText(/Preserve the exported contract/)).not.toBeInTheDocument();

    rerender(<ImpactReportPage report={explainedReport} view="findings" />);

    expect(screen.queryByText(/application layout imports the session validator/i)).not.toBeInTheDocument();
    expect(screen.getByText("validateSession · lib/auth.ts")).toBeVisible();
    rerender(<ImpactReportPage report={explainedReport} view="evidence" />);

    expect(
      screen.getByRole("heading", { name: "Supporting sources" }),
    ).toBeVisible();
  });

  it("renders only the audiences supported by a v2 practical briefing", () => {
    const v2Report: AtlasImpactReport = {
      ...report,
      explanation: {
        status: "completed",
        schemaVersion: "2",
        explanation: {
          schemaVersion: "2",
          bottomLine: {
            text: "Session validation can change safely if the observed application contract remains stable.",
            evidenceIds: ["relationship-1"],
          },
          practicalImpacts: [
            {
              audience: "product",
              text: "User-facing session behavior may change on the authenticated layout path.",
              evidenceIds: ["relationship-1"],
            },
            {
              audience: "engineering",
              text: "The layout imports the validator, so its exported contract must remain compatible.",
              evidenceIds: ["relationship-1"],
            },
          ],
          nextActions: [{
            text: "Implement the validator change behind the existing import contract.",
            evidenceIds: ["relationship-1"],
          }],
          verificationChecks: [{
            text: "Run the authenticated layout integration path before merge.",
            evidenceIds: ["relationship-1"],
          }],
          openQuestions: [],
        },
        metadata: {
          provider: "groq",
          model: "test-model",
          promptVersion: "16",
          outputSchemaVersion: "2",
          evidencePacketHash: "packet-hash",
          sourceRevision: "abcdef1234567890",
          generatedAt: "2026-07-29T12:00:01.000Z",
          latencyMs: 250,
          usage: { inputTokens: 100, outputTokens: 80, totalTokens: 180 },
          validationStatus: "valid",
          failureCode: null,
          deterministicFallback: false,
        },
      },
    };

    render(<ImpactReportPage report={v2Report} />);

    expect(screen.getByText("product", { selector: "article span" })).toBeVisible();
    expect(screen.getByText("engineering", { selector: "article span" })).toBeVisible();
    expect(screen.queryByText("operations", { selector: "article span" })).not.toBeInTheDocument();
    expect(screen.getByText("Based on 1 verified source")).toBeVisible();
    expect(screen.getByRole("link", { name: "View evidence" })).toHaveAttribute(
      "href",
      `/app/impact/${v2Report.id}/evidence`,
    );
  });

  it("visually distinguishes historical relationships from observed findings", () => {
    const historicalReport: AtlasImpactReport = {
      ...report,
      result: {
        ...report.result,
        downstreamImpacts: [
          {
            ...report.result.downstreamImpacts[0],
            id: "historical-downstream-1",
            title: "app/legacy-layout.tsx",
            filePath: "app/legacy-layout.tsx",
            confidence: 0.75,
            provenance: "historical_relationship",
            evidenceIds: ["historical-relationship-1"],
          },
        ],
        evidence: [
          {
            ...report.result.evidence[0],
            id: "historical-relationship-1",
            filePath: "app/legacy-layout.tsx",
            provenance: "historical_relationship",
            sourceRevision: "old-revision",
          },
        ],
      },
    };
    const { container, rerender } = render(
      <ImpactReportPage report={historicalReport} view="findings" />,
    );

    expect(container.querySelector(".confidence--historical")).toHaveTextContent(
      "historical",
    );

    rerender(
      <ImpactReportPage report={historicalReport} view="evidence" />,
    );
    expect(
      container.querySelector(".evidence-row--violet"),
    ).toBeInTheDocument();
  });

  it("retries a failed explanation without hiding the verified report", async () => {
    const failedReport: AtlasImpactReport = {
      ...report,
      explanation: {
        status: "failed",
        schemaVersion: "1",
        failureCode: "provider_rate_limited",
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
    expect(screen.getByText("AI provider limit reached")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry briefing" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/AI briefing is still generating/i),
      ).toBeVisible();
    });
    expect(screen.getByRole("tab", { name: /Atlas report/i })).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      `/api/impact-reports/${report.id}/explanation/retry`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});
