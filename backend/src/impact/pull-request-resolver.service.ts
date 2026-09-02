import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { GitHubAppService } from "../connectors/github-app.service";
import { ImpactRepository } from "./impact.repository";
import type { ImpactReportInput, ImpactScope } from "./impact.types";

@Injectable()
export class PullRequestResolverService {
  constructor(
    private readonly github: GitHubAppService,
    private readonly repository: ImpactRepository,
  ) {}

  async resolve(
    workspaceId: string,
    repositoryId: string,
    pullRequestNumber: number,
    scope: ImpactScope,
  ): Promise<ImpactReportInput> {
    const repository = await this.repository.repositoryDetails(
      workspaceId,
      repositoryId,
    );
    if (!repository) throw new BadRequestException("Repository not found.");
    if (!repository.installationId) {
      throw new BadRequestException(
        "The repository is not connected through an active GitHub App installation.",
      );
    }

    const {
      pullRequest,
      author,
      mergedBy,
      files,
      filesTruncated,
      reviews = [],
      reviewsTruncated = false,
    } = await this.github
      .getPullRequest(
        repository.installationId,
        repository.owner,
        repository.name,
        pullRequestNumber,
      )
      .catch((error: unknown) => {
        if (error instanceof ServiceUnavailableException) throw error;
        throw new ServiceUnavailableException(
          "GitHub pull-request details could not be loaded.",
        );
      });

    const patchCharacterBudget = 250_000;
    let remainingPatchCharacters = patchCharacterBudget;
    const changedFiles = files.map((file) => ({
      path: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch: this.takePatch(file.patch, () => remainingPatchCharacters, (used) => {
        remainingPatchCharacters -= used;
      }),
    }));
    const fileSummary = changedFiles
      .map((file) => `${file.status}: ${file.path}`)
      .join("\n");
    const patchSummary = changedFiles
      .flatMap((file) =>
        (file.patch ?? "")
          .split("\n")
          .filter(
            (line) =>
              (line.startsWith("+") || line.startsWith("-")) &&
              !line.startsWith("+++") &&
              !line.startsWith("---"),
          )
          .slice(0, 24),
      )
      .join("\n")
      .slice(0, 20_000);
    const description = [
      `GitHub pull request #${pullRequest.number}: ${pullRequest.title}`,
      pullRequest.body?.slice(0, 2_000),
      `Changed files (${files.length} retrieved of ${pullRequest.changed_files} reported):\n${fileSummary}`,
      patchSummary ? `Changed code:\n${patchSummary}` : undefined,
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 64_000);
    const filesWithPatchContext = changedFiles.filter((file) =>
      Boolean(file.patch),
    ).length;
    const patchCharactersAnalyzed =
      patchCharacterBudget - remainingPatchCharacters;

    return {
      mode: "pull-request",
      repositoryId,
      description,
      scope,
      anchors: changedFiles.map((file) => file.path),
      pullRequest: {
        number: pullRequest.number,
        title: pullRequest.title,
        body: pullRequest.body?.slice(0, 2_000),
        url: pullRequest.html_url,
        author: author?.login ?? pullRequest.user?.login ?? "unknown",
        authorDetails: author,
        reviewers: this.latestReviewers(reviews),
        mergedBy,
        reviewsTruncated,
        baseRevision: pullRequest.base.sha,
        headRevision: pullRequest.head.sha,
        analysisBudget: {
          totalChangedFiles: pullRequest.changed_files,
          filesRetrieved: files.length,
          filesWithPatchContext,
          patchCharactersAnalyzed,
          githubFileLimitReached: filesTruncated,
        },
        changedFiles,
      },
    };
  }

  private latestReviewers(
    reviews: Array<{
      providerReviewId: string;
      reviewer: import("../connectors/github-app.service").GitHubActor | null;
      state: string;
      submittedAt: string | null;
      url: string;
    }>,
  ) {
    const latest = new Map<string, (typeof reviews)[number]>();
    for (const review of reviews) {
      const key =
        review.reviewer?.providerUserId ??
        review.reviewer?.login ??
        review.providerReviewId;
      const current = latest.get(key);
      if (
        !current ||
        (Date.parse(review.submittedAt ?? "") || 0) >=
          (Date.parse(current.submittedAt ?? "") || 0)
      ) {
        latest.set(key, review);
      }
    }
    return [...latest.values()].map((review) => ({
      actor: review.reviewer,
      state: review.state,
      submittedAt: review.submittedAt,
      url: review.url,
    }));
  }

  private takePatch(
    patch: string | undefined,
    remaining: () => number,
    record: (used: number) => void,
  ): string | undefined {
    if (!patch || remaining() <= 0) return undefined;
    const selected = patch.slice(0, Math.min(8_000, remaining()));
    record(selected.length);
    return selected;
  }
}
