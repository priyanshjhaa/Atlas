import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { GitHubAppService } from "../src/connectors/github-app.service";
import type { ImpactRepository } from "../src/impact/impact.repository";
import { PullRequestResolverService } from "../src/impact/pull-request-resolver.service";

const workspaceId = "01951ca1-2c72-7000-8000-000000000001";
const repositoryId = "01951ca1-2c72-7000-8000-000000000002";

function setup() {
  const repository = {
    repositoryDetails: vi.fn().mockResolvedValue({
      id: repositoryId,
      owner: "atlas",
      name: "web",
      defaultBranch: "main",
      lastSyncedRevision: "base-sha",
      installationId: "12345",
    }),
  };
  const github = {
    getPullRequest: vi.fn().mockResolvedValue({
      pullRequest: {
        number: 42,
        title: "Reject revoked sessions",
        body: "Validate the session before loading workspace data.",
        html_url: "https://github.com/atlas/web/pull/42",
        changed_files: 1,
        additions: 8,
        deletions: 2,
        user: { login: "engineer" },
        base: { sha: "base-sha", ref: "main" },
        head: { sha: "head-sha", ref: "session-check" },
      },
      files: [
        {
          filename: "lib/auth-session.ts",
          status: "modified",
          additions: 8,
          deletions: 2,
          changes: 10,
          patch:
            "@@ -1,2 +1,3 @@\n-oldValidation()\n+requireAtlasSession()\n",
        },
      ],
      filesTruncated: false,
    }),
  };
  return {
    github,
    repository,
    service: new PullRequestResolverService(
      github as unknown as GitHubAppService,
      repository as unknown as ImpactRepository,
    ),
  };
}

describe("PullRequestResolverService", () => {
  it("turns a GitHub pull-request diff into evidence-resolution input", async () => {
    const { github, service } = setup();

    const result = await service.resolve(
      workspaceId,
      repositoryId,
      42,
      "repository",
    );

    expect(github.getPullRequest).toHaveBeenCalledWith(
      "12345",
      "atlas",
      "web",
      42,
    );
    expect(result).toMatchObject({
      mode: "pull-request",
      anchors: ["lib/auth-session.ts"],
      pullRequest: {
        number: 42,
        author: "engineer",
        baseRevision: "base-sha",
        headRevision: "head-sha",
        analysisBudget: {
          totalChangedFiles: 1,
          filesRetrieved: 1,
          filesWithPatchContext: 1,
          githubFileLimitReached: false,
        },
      },
    });
    expect(result.description).toContain("Reject revoked sessions");
    expect(result.description).toContain("requireAtlasSession");
  });

  it("accepts pull requests with more than 100 changed files", async () => {
    const { github, service } = setup();
    const files = Array.from({ length: 125 }, (_, index) => ({
      filename: `src/module-${index}.ts`,
      status: "modified",
      additions: 2,
      deletions: 1,
      changes: 3,
      patch: `@@ -1 +1 @@\n-old${index}\n+new${index}`,
    }));
    github.getPullRequest.mockResolvedValue({
      pullRequest: {
        number: 42,
        title: "Large refactor",
        body: null,
        html_url: "https://github.com/atlas/web/pull/42",
        changed_files: 125,
        additions: 250,
        deletions: 125,
        user: { login: "engineer" },
        base: { sha: "base-sha", ref: "main" },
        head: { sha: "head-sha", ref: "large-refactor" },
      },
      files,
      filesTruncated: false,
    });

    const result = await service.resolve(
      workspaceId,
      repositoryId,
      42,
      "repository",
    );

    expect(result.anchors).toHaveLength(125);
    expect(result.pullRequest?.changedFiles).toHaveLength(125);
    expect(result.pullRequest?.analysisBudget).toMatchObject({
      totalChangedFiles: 125,
      filesRetrieved: 125,
      githubFileLimitReached: false,
    });
  });

  it("requires an active GitHub App installation", async () => {
    const { repository, service } = setup();
    repository.repositoryDetails.mockResolvedValue({
      id: repositoryId,
      owner: "atlas",
      name: "web",
      defaultBranch: "main",
      lastSyncedRevision: "base-sha",
      installationId: null,
    });

    await expect(
      service.resolve(workspaceId, repositoryId, 42, "repository"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
