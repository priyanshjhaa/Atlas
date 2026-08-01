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
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  changed_files: number;
  additions: number;
  deletions: number;
  user: { login: string };
  base: { sha: string; ref: string };
  head: { sha: string; ref: string };
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
    files: GitHubPullRequestFile[];
    filesTruncated: boolean;
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
    return {
      pullRequest,
      files,
      filesTruncated: pullRequest.changed_files > files.length,
    };
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
