import { describe, expect, it } from "vitest";
import type { GitHubPullRequestProvenance } from "../src/connectors/github-app.service";
import { boundPullRequestProvenance } from "../src/intelligence/pull-request-provenance";

function pullRequest(index: number): GitHubPullRequestProvenance {
  return {
    providerPullRequestId: `PR_${index}`,
    number: index,
    title: `Pull request ${index}`,
    url: `https://github.com/atlas/web/pull/${index}`,
    state: "OPEN",
    isDraft: false,
    author: null,
    mergedBy: null,
    baseRevision: "base",
    headRevision: `head-${index}`,
    providerCreatedAt: "2026-08-01T00:00:00.000Z",
    providerUpdatedAt: "2026-08-02T00:00:00.000Z",
    closedAt: null,
    mergedAt: null,
    reviews: Array.from({ length: 55 }, (_, reviewIndex) => ({
      providerReviewId: `R_${index}_${reviewIndex}`,
      reviewer: null,
      state: "COMMENTED",
      submittedAt: null,
      url: `https://github.com/atlas/web/pull/${index}#review-${reviewIndex}`,
    })),
    reviewsTruncated: false,
  };
}

describe("boundPullRequestProvenance", () => {
  it("keeps only 50 pull requests and the latest 50 reviews per pull request", () => {
    const bounded = boundPullRequestProvenance(
      Array.from({ length: 55 }, (_, index) => pullRequest(index + 1)),
    );

    expect(bounded).toHaveLength(50);
    expect(bounded[0]?.reviews).toHaveLength(50);
    expect(bounded[0]?.reviews[0]?.providerReviewId).toBe("R_1_5");
    expect(bounded[0]?.reviewsTruncated).toBe(true);
  });
});
