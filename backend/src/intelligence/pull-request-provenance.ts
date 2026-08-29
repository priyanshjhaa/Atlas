import type { GitHubPullRequestProvenance } from "../connectors/github-app.service";

const MAX_RECENT_PULL_REQUESTS = 50;
const MAX_REVIEWS_PER_PULL_REQUEST = 50;

export function boundPullRequestProvenance(
  pullRequests: GitHubPullRequestProvenance[],
): GitHubPullRequestProvenance[] {
  return pullRequests.slice(0, MAX_RECENT_PULL_REQUESTS).map((pullRequest) => ({
    ...pullRequest,
    reviews: pullRequest.reviews.slice(-MAX_REVIEWS_PER_PULL_REQUEST),
    reviewsTruncated:
      pullRequest.reviewsTruncated ||
      pullRequest.reviews.length > MAX_REVIEWS_PER_PULL_REQUEST,
  }));
}
