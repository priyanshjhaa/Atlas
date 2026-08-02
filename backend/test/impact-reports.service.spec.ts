import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedIdentity } from "../src/auth/auth.types";
import type { ExplanationGenerationService } from "../src/impact/explanation-generation.service";
import type { ImpactAnalysisService } from "../src/impact/impact-analysis.service";
import type { ImpactRepository } from "../src/impact/impact.repository";
import { ImpactReportsService } from "../src/impact/impact-reports.service";
import type { StoredImpactReport } from "../src/impact/impact.types";
import type { PullRequestResolverService } from "../src/impact/pull-request-resolver.service";

const identity: AuthenticatedIdentity = {
  sessionId: "session-1",
  user: {
    id: "user-1",
    name: "Atlas User",
    email: "atlas@example.com",
    image: null,
  },
};

function setup() {
  const deterministic = {
    sourceRevision: "revision-1",
  };
  const stored = {
    id: "report-1",
    workspaceId: "workspace-1",
    repositoryId: "repository-1",
    input: {},
    result: deterministic,
  } as StoredImpactReport;
  const enhanced = {
    ...stored,
    explanation: { status: "completed" },
  } as unknown as StoredImpactReport;
  const analysis = { analyze: vi.fn().mockResolvedValue(deterministic) };
  const repository = {
    create: vi.fn().mockResolvedValue(stored),
    findById: vi.fn().mockResolvedValue(stored),
    findFeedback: vi.fn().mockResolvedValue(null),
    upsertFeedback: vi.fn(),
  };
  const pullRequests = { resolve: vi.fn() };
  const explanations = { generate: vi.fn().mockResolvedValue(enhanced) };
  const service = new ImpactReportsService(
    analysis as unknown as ImpactAnalysisService,
    repository as unknown as ImpactRepository,
    pullRequests as unknown as PullRequestResolverService,
    explanations as unknown as ExplanationGenerationService,
  );
  return {
    service,
    analysis,
    repository,
    pullRequests,
    explanations,
    stored,
    enhanced,
  };
}

describe("ImpactReportsService explanation integration", () => {
  it("persists deterministic analysis before generating an explanation", async () => {
    const { service, analysis, repository, explanations, stored, enhanced } =
      setup();

    await expect(
      service.create(
        "workspace-1",
        {
          mode: "planned",
          repositoryId: "repository-1",
          description: "Rotate sessions.",
          scope: "repository",
          anchors: [],
        },
        identity,
      ),
    ).resolves.toBe(enhanced);

    expect(analysis.analyze).toHaveBeenCalledOnce();
    expect(repository.create).toHaveBeenCalledOnce();
    expect(explanations.generate).toHaveBeenCalledWith(stored);
    expect(repository.create.mock.invocationCallOrder[0]).toBeLessThan(
      explanations.generate.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("retries a persisted report and rejects unknown reports", async () => {
    const { service, repository, explanations, stored, enhanced } = setup();

    await expect(
      service.retryExplanation("workspace-1", "report-1"),
    ).resolves.toBe(enhanced);
    expect(explanations.generate).toHaveBeenCalledWith(stored, {
      retryPending: true,
    });

    repository.findById.mockResolvedValue(null);
    await expect(
      service.retryExplanation("workspace-1", "missing-report"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("restores feedback only for the current report viewer", async () => {
    const { service, repository } = setup();
    repository.findFeedback.mockResolvedValue({
      id: "feedback-1",
      rating: "useful",
    });

    await expect(
      service.get("workspace-1", "report-1", identity),
    ).resolves.toMatchObject({
      id: "report-1",
      viewerFeedback: { id: "feedback-1", rating: "useful" },
    });
    expect(repository.findFeedback).toHaveBeenCalledWith(
      "workspace-1",
      "report-1",
      "user-1",
    );
  });

  it("generates explanations for resolved pull-request reports", async () => {
    const {
      service,
      analysis,
      pullRequests,
      explanations,
      stored,
      enhanced,
    } = setup();
    const resolvedInput = {
      mode: "pull-request" as const,
      repositoryId: "repository-1",
      description: "Pull request #12",
      scope: "repository" as const,
      anchors: ["src/session.ts"],
      pullRequest: {
        number: 12,
        title: "Rotate sessions",
        url: "https://github.com/atlas/identity/pull/12",
        author: "atlas-dev",
        baseRevision: "revision-1",
        headRevision: "revision-2",
        analysisBudget: {
          totalChangedFiles: 1,
          filesRetrieved: 1,
          filesWithPatchContext: 1,
          patchCharactersAnalyzed: 10,
          githubFileLimitReached: false,
        },
        changedFiles: [],
      },
    };
    pullRequests.resolve.mockResolvedValue(resolvedInput);

    await expect(
      service.create(
        "workspace-1",
        {
          mode: "pull-request",
          repositoryId: "repository-1",
          pullRequestNumber: 12,
          scope: "repository",
        },
        identity,
      ),
    ).resolves.toBe(enhanced);

    expect(analysis.analyze).toHaveBeenCalledWith(
      "workspace-1",
      resolvedInput,
    );
    expect(explanations.generate).toHaveBeenCalledWith(stored);
  });

  it("normalizes and persists tenant-scoped pilot feedback", async () => {
    const { service, repository } = setup();
    repository.upsertFeedback.mockResolvedValue({
      id: "feedback-1",
      rating: "useful",
      confirmedFindingIds: ["finding-1", "finding-2"],
      missedImpact: null,
      comment: "Clear evidence.",
      timeToFeedbackSeconds: 42,
    });

    await expect(
      service.submitFeedback(
        "workspace-1",
        "report-1",
        {
          rating: "useful",
          confirmedFindingIds: [
            "finding-1",
            "finding-1",
            "finding-2",
          ],
          missedImpact: "  ",
          comment: "  Clear evidence.  ",
        },
        identity,
      ),
    ).resolves.toMatchObject({
      id: "feedback-1",
      rating: "useful",
      timeToFeedbackSeconds: 42,
    });
    expect(repository.upsertFeedback).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      reportId: "report-1",
      submittedByUserId: "user-1",
      rating: "useful",
      confirmedFindingIds: ["finding-1", "finding-2"],
      missedImpact: null,
      comment: "Clear evidence.",
    });
  });

  it("does not accept feedback for a report outside the workspace", async () => {
    const { service, repository } = setup();
    repository.upsertFeedback.mockResolvedValue(null);

    await expect(
      service.submitFeedback(
        "workspace-1",
        "foreign-report",
        { rating: "not_useful", missedImpact: "Missed API consumer." },
        identity,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
