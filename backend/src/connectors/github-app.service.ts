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
