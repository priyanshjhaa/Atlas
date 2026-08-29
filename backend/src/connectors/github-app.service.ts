import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { importPKCS8, SignJWT } from "jose";
import { createPrivateKey } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extract } from "tar";
import type { Environment } from "../config/environment";

export interface GitHubInstallation {
  id: number;
  account: { id: number; login: string; type: string };
  repository_selection: "all" | "selected";
  permissions: Record<string, string>;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  owner: { login: string };
}

export interface GitHubPullRequest {
  id?: number;
  node_id?: string;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state?: string;
  draft?: boolean;
  changed_files: number;
  additions: number;
  deletions: number;
  user: GitHubRestActor | null;
  merged_by?: GitHubRestActor | null;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
  merged_at?: string | null;
  base: { sha: string; ref: string };
  head: { sha: string; ref: string };
}

interface GitHubRestActor {
  id?: number;
  node_id?: string;
  login?: string;
  name?: string | null;
  avatar_url?: string;
  html_url?: string;
  type?: string;
}

interface GitHubGraphqlActor {
  id: string;
  login: string;
  name?: string | null;
  avatarUrl: string;
  url: string;
  __typename: string;
}

export interface GitHubActor {
  providerUserId: string | null;
  login: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  kind: "person" | "bot" | "unknown";
}

export interface GitHubPullRequestReview {
  providerReviewId: string;
  reviewer: GitHubActor | null;
  state: string;
  submittedAt: string | null;
  url: string;
}

export interface GitHubPullRequestProvenance {
  providerPullRequestId: string;
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  author: GitHubActor | null;
  mergedBy: GitHubActor | null;
  baseRevision: string;
  headRevision: string;
  providerCreatedAt: string;
  providerUpdatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  reviews: GitHubPullRequestReview[];
  reviewsTruncated: boolean;
}

export interface GitHubPullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
}

export interface GitHubCommitHistoryItem {
  sha: string;
  message: string;
  htmlUrl: string;
  authorName: string | null;
  authorLogin: string | null;
  authoredAt: string | null;
  committedAt: string | null;
  parentShas: string[];
}

export interface GitHubHistoryFile {
  path: string;
  previousPath: string | null;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
}

export interface GitHubRepositoryHistory {
  baseRevision: string | null;
  headRevision: string;
  status: string;
  aheadBy: number;
  behindBy: number;
  totalCommits: number;
  commits: GitHubCommitHistoryItem[];
  files: GitHubHistoryFile[];
  commitsTruncated: boolean;
  filesTruncated: boolean;
}

interface GitHubCommitResponse {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
    committer: { date: string } | null;
  };
  author: { login: string } | null;
  parents: Array<{ sha: string }>;
}

const GITHUB_HISTORY_PAGE_SIZE = 100;
const GITHUB_HISTORY_MAX_PAGES = 3;
const GITHUB_HISTORY_MAX_COMMITS =
  GITHUB_HISTORY_PAGE_SIZE * GITHUB_HISTORY_MAX_PAGES;
const GITHUB_HISTORY_MAX_FILES = 300;
const GITHUB_RECENT_PULL_REQUEST_LIMIT = 50;
const GITHUB_PULL_REQUEST_REVIEW_LIMIT = 50;
const GITHUB_ON_DEMAND_REVIEW_MAX_PAGES = 3;

@Injectable()
export class GitHubAppService {
  private readonly apiVersion = "2026-03-10";

  constructor(private readonly config: ConfigService<Environment, true>) {}

  async getInstallation(installationId: string): Promise<GitHubInstallation> {
    return this.request<GitHubInstallation>(
      `/app/installations/${installationId}`,
      await this.createAppJwt(),
    );
  }

  async listInstallationRepositories(
    installationId: string,
  ): Promise<GitHubRepository[]> {
    const token = await this.createInstallationToken(installationId);
    const repositories: GitHubRepository[] = [];

    for (let page = 1; ; page += 1) {
      const response = await this.request<{
        repositories: GitHubRepository[];
      }>(
        `/installation/repositories?per_page=100&page=${page}`,
        token,
      );
      repositories.push(...response.repositories);
      if (response.repositories.length < 100) break;
    }

    return repositories;
  }

  async getRepositoryHead(
    installationId: string,
    owner: string,
    repository: string,
    ref: string,
  ): Promise<string> {
    const token = await this.createInstallationToken(installationId);
    const commit = await this.request<{ sha: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits/${encodeURIComponent(ref)}`,
      token,
    );
    return commit.sha;
  }

  async getPullRequest(
    installationId: string,
    owner: string,
    repository: string,
    number: number,
  ): Promise<{
    pullRequest: GitHubPullRequest;
    author: GitHubActor | null;
    mergedBy: GitHubActor | null;
    files: GitHubPullRequestFile[];
    filesTruncated: boolean;
    reviews: GitHubPullRequestReview[];
    reviewsTruncated: boolean;
  }> {
    const token = await this.createInstallationToken(installationId);
    const pullRequest = await this.request<GitHubPullRequest>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls/${number}`,
      token,
    );
    const files: GitHubPullRequestFile[] = [];
    const githubFileLimit = 3_000;
    for (let page = 1; files.length < githubFileLimit; page += 1) {
      const batch = await this.request<GitHubPullRequestFile[]>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls/${number}/files?per_page=100&page=${page}`,
        token,
      );
      files.push(...batch);
      if (batch.length < 100) break;
    }
    const reviews: GitHubPullRequestReview[] = [];
    let reviewsTruncated = false;
    for (let page = 1; page <= GITHUB_ON_DEMAND_REVIEW_MAX_PAGES; page += 1) {
      const batch = await this.request<
        Array<{
          id: number;
          node_id?: string;
          user: GitHubRestActor | null;
          state: string;
          submitted_at: string | null;
          html_url: string;
        }>
      >(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls/${number}/reviews?per_page=100&page=${page}`,
        token,
      );
      reviews.push(
        ...batch.map((review) => ({
          providerReviewId: review.node_id ?? String(review.id),
          reviewer: this.restActor(review.user),
          state: review.state,
          submittedAt: review.submitted_at,
          url: review.html_url,
        })),
      );
      if (batch.length < 100) break;
      reviewsTruncated = page === GITHUB_ON_DEMAND_REVIEW_MAX_PAGES;
    }
    return {
      pullRequest,
      author: this.restActor(pullRequest.user),
      mergedBy: this.restActor(pullRequest.merged_by),
      files,
      filesTruncated: pullRequest.changed_files > files.length,
      reviews,
      reviewsTruncated,
    };
  }

  async getRecentPullRequestProvenance(input: {
    installationId: string;
    owner: string;
    repository: string;
  }): Promise<GitHubPullRequestProvenance[]> {
    const token = await this.createInstallationToken(input.installationId);
    const response = await this.graphql<{
      repository: {
        pullRequests: {
          nodes: Array<{
            id: string;
            number: number;
            title: string;
            url: string;
            state: string;
            isDraft: boolean;
            author: GitHubGraphqlActor | null;
            mergedBy: GitHubGraphqlActor | null;
            baseRefOid: string;
            headRefOid: string;
            createdAt: string;
            updatedAt: string;
            closedAt: string | null;
            mergedAt: string | null;
            reviews: {
              nodes: Array<{
                id: string;
                author: GitHubGraphqlActor | null;
                state: string;
                submittedAt: string | null;
                url: string;
              }>;
              pageInfo: { hasPreviousPage: boolean };
            };
          }>;
        };
      } | null;
    }>(
      `query AtlasRecentPullRequests($owner: String!, $repository: String!) {
        repository(owner: $owner, name: $repository) {
          pullRequests(first: ${GITHUB_RECENT_PULL_REQUEST_LIMIT}, orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes {
              id number title url state isDraft baseRefOid headRefOid
              createdAt updatedAt closedAt mergedAt
              author { id login avatarUrl url __typename ... on User { name } }
              mergedBy { id login avatarUrl url __typename ... on User { name } }
              reviews(last: ${GITHUB_PULL_REQUEST_REVIEW_LIMIT}) {
                nodes {
                  id state submittedAt url
                  author { id login avatarUrl url __typename ... on User { name } }
                }
                pageInfo { hasPreviousPage }
              }
            }
          }
        }
      }`,
      { owner: input.owner, repository: input.repository },
      token,
    );
    return (response.repository?.pullRequests.nodes ?? []).map((pullRequest) => ({
      providerPullRequestId: pullRequest.id,
      number: pullRequest.number,
      title: pullRequest.title,
      url: pullRequest.url,
      state: pullRequest.state,
      isDraft: pullRequest.isDraft,
      author: this.graphqlActor(pullRequest.author),
      mergedBy: this.graphqlActor(pullRequest.mergedBy),
      baseRevision: pullRequest.baseRefOid,
      headRevision: pullRequest.headRefOid,
      providerCreatedAt: pullRequest.createdAt,
      providerUpdatedAt: pullRequest.updatedAt,
      closedAt: pullRequest.closedAt,
      mergedAt: pullRequest.mergedAt,
      reviews: pullRequest.reviews.nodes.map((review) => ({
        providerReviewId: review.id,
        reviewer: this.graphqlActor(review.author),
        state: review.state,
        submittedAt: review.submittedAt,
        url: review.url,
      })),
      reviewsTruncated: pullRequest.reviews.pageInfo.hasPreviousPage,
    }));
  }

  async getRepositoryHistory(input: {
    installationId: string;
    owner: string;
    repository: string;
    baseRevision?: string | null;
    headRevision: string;
  }): Promise<GitHubRepositoryHistory> {
    const token = await this.createInstallationToken(input.installationId);
    if (!input.baseRevision) {
      return this.recentRepositoryHistory(input, token, "recent");
    }
    try {
      const commitsBySha = new Map<string, GitHubCommitResponse>();
      let files: GitHubHistoryFile[] = [];
      let filesTruncated = false;
      let status = "unknown";
      let aheadBy = 0;
      let behindBy = 0;
      let totalCommits = 0;
      for (let page = 1; page <= GITHUB_HISTORY_MAX_PAGES; page += 1) {
        const response = await this.request<{
          status: string;
          ahead_by: number;
          behind_by: number;
          total_commits: number;
          commits: GitHubCommitResponse[];
          files?: GitHubPullRequestFile[];
        }>(
          `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/compare/${encodeURIComponent(input.baseRevision)}...${encodeURIComponent(input.headRevision)}?per_page=${GITHUB_HISTORY_PAGE_SIZE}&page=${page}`,
          token,
        );
        status = response.status;
        aheadBy = response.ahead_by;
        behindBy = response.behind_by;
        totalCommits = response.total_commits;
        for (const commit of response.commits) {
          if (!commitsBySha.has(commit.sha)) {
            commitsBySha.set(commit.sha, commit);
          }
        }
        if (page === 1) {
          filesTruncated =
            (response.files?.length ?? 0) >= GITHUB_HISTORY_MAX_FILES;
          files = [
            ...new Map(
              (response.files ?? [])
                .slice(0, GITHUB_HISTORY_MAX_FILES)
                .map((file) => [
                  file.filename,
                  {
                    path: file.filename,
                    previousPath: file.previous_filename ?? null,
                    status: file.status,
                    additions: file.additions,
                    deletions: file.deletions,
                    changes: file.changes,
                  },
                ]),
            ).values(),
          ];
        }
        if (
          response.commits.length < GITHUB_HISTORY_PAGE_SIZE ||
          commitsBySha.size >= totalCommits
        ) {
          break;
        }
      }
      const commits = [...commitsBySha.values()].slice(
        0,
        GITHUB_HISTORY_MAX_COMMITS,
      );
      return {
        baseRevision: input.baseRevision,
        headRevision: input.headRevision,
        status,
        aheadBy,
        behindBy,
        totalCommits,
        commits: commits.map((commit) => this.commitHistoryItem(commit)),
        files,
        commitsTruncated: totalCommits > commits.length,
        filesTruncated,
      };
    } catch {
      return this.recentRepositoryHistory(
        input,
        token,
        "comparison_unavailable",
      );
    }
  }

  async downloadRepositoryArchive(input: {
    installationId: string;
    owner: string;
    repository: string;
    revision: string;
    destinationPath: string;
    signal?: AbortSignal;
  }): Promise<{ bytesDownloaded: number }> {
    const token = await this.createInstallationToken(input.installationId);
    const timeout = AbortSignal.timeout(30_000);
    const signal = input.signal
      ? AbortSignal.any([input.signal, timeout])
      : timeout;
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/tarball/${encodeURIComponent(input.revision)}`,
      {
        signal,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": this.apiVersion,
        },
      },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `GitHub archive request failed with status ${response.status}.`,
      );
    }

    const maximumArchiveBytes = 100 * 1024 * 1024;
    const announcedSize = Number(response.headers.get("content-length") ?? 0);
    if (announcedSize > maximumArchiveBytes) {
      throw new ServiceUnavailableException(
        "The repository archive exceeds the 100 MB ingestion limit.",
      );
    }
    const archive = Buffer.from(await response.arrayBuffer());
    if (archive.byteLength > maximumArchiveBytes) {
      throw new ServiceUnavailableException(
        "The repository archive exceeds the 100 MB ingestion limit.",
      );
    }

    await mkdir(input.destinationPath, { recursive: true });
    const archivePath = join(input.destinationPath, "repository.tar.gz");
    await writeFile(archivePath, archive);
    await extract({
      cwd: input.destinationPath,
      file: archivePath,
      preservePaths: false,
      strict: true,
      strip: 1,
    });
    return { bytesDownloaded: archive.byteLength };
  }

  private async createInstallationToken(
    installationId: string,
  ): Promise<string> {
    const response = await this.request<{ token: string }>(
      `/app/installations/${installationId}/access_tokens`,
      await this.createAppJwt(),
      { method: "POST" },
    );
    return response.token;
  }

  private async recentRepositoryHistory(
    input: {
      owner: string;
      repository: string;
      baseRevision?: string | null;
      headRevision: string;
    },
    token: string,
    status: "recent" | "comparison_unavailable",
  ): Promise<GitHubRepositoryHistory> {
    const commits = await this.request<GitHubCommitResponse[]>(
      `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/commits?sha=${encodeURIComponent(input.headRevision)}&per_page=${GITHUB_HISTORY_PAGE_SIZE}&page=1`,
      token,
    );
    const uniqueCommits = [
      ...new Map(commits.map((commit) => [commit.sha, commit])).values(),
    ].slice(0, GITHUB_HISTORY_PAGE_SIZE);
    return {
      baseRevision: input.baseRevision ?? null,
      headRevision: input.headRevision,
      status,
      aheadBy: uniqueCommits.length,
      behindBy: 0,
      totalCommits: uniqueCommits.length,
      commits: uniqueCommits.map((commit) => this.commitHistoryItem(commit)),
      files: [],
      commitsTruncated: commits.length === GITHUB_HISTORY_PAGE_SIZE,
      filesTruncated: false,
    };
  }

  private commitHistoryItem(
    commit: GitHubCommitResponse,
  ): GitHubCommitHistoryItem {
    return {
      sha: commit.sha,
      message: commit.commit.message,
      htmlUrl: commit.html_url,
      authorName: commit.commit.author?.name ?? null,
      authorLogin: commit.author?.login ?? null,
      authoredAt: commit.commit.author?.date ?? null,
      committedAt: commit.commit.committer?.date ?? null,
      parentShas: commit.parents.map((parent) => parent.sha),
    };
  }

  private async createAppJwt(): Promise<string> {
    const appId = this.requireConfig("GITHUB_APP_ID");
    const encodedPrivateKey = this.requireConfig("GITHUB_APP_PRIVATE_KEY");
    const privateKey = Buffer.from(encodedPrivateKey, "base64").toString(
      "utf8",
    );
    const pkcs8PrivateKey = createPrivateKey(privateKey)
      .export({ format: "pem", type: "pkcs8" })
      .toString();
    const key = await importPKCS8(pkcs8PrivateKey, "RS256");
    const now = Math.floor(Date.now() / 1000);

    return new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt(now - 60)
      .setExpirationTime(now + 9 * 60)
      .setIssuer(appId)
      .sign(key);
  }

  private async request<T>(
    path: string,
    token: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": this.apiVersion,
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `GitHub App request failed with status ${response.status}.`,
      );
    }
    return (await response.json()) as T;
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, string>,
    token: string,
  ): Promise<T> {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": this.apiVersion,
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      data?: T;
      errors?: Array<{ message?: string }>;
    };
    if (!response.ok || !body.data || body.errors?.length) {
      throw new ServiceUnavailableException(
        `GitHub GraphQL request failed with status ${response.status}.`,
      );
    }
    return body.data;
  }

  private restActor(actor: GitHubRestActor | null | undefined): GitHubActor | null {
    if (!actor) return null;
    return {
      providerUserId: actor.node_id ?? (actor.id ? String(actor.id) : null),
      login: actor.login ?? null,
      displayName: actor.name ?? null,
      avatarUrl: actor.avatar_url ?? null,
      profileUrl: actor.html_url ?? null,
      kind:
        actor.type?.toLowerCase() === "bot"
          ? "bot"
          : actor.login || actor.id
            ? "person"
            : "unknown",
    };
  }

  private graphqlActor(actor: GitHubGraphqlActor | null): GitHubActor | null {
    if (!actor) return null;
    return {
      providerUserId: actor.id,
      login: actor.login,
      displayName: actor.name ?? null,
      avatarUrl: actor.avatarUrl,
      profileUrl: actor.url,
      kind: actor.__typename === "Bot" ? "bot" : "person",
    };
  }

  private requireConfig(
    key: "GITHUB_APP_ID" | "GITHUB_APP_PRIVATE_KEY",
  ): string {
    const value = this.config.get(key, { infer: true });
    if (!value) {
      throw new ServiceUnavailableException(
        "The GitHub App connector is not configured.",
      );
    }
    return value;
  }
}
