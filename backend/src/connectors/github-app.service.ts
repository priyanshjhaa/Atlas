import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { importPKCS8, SignJWT } from "jose";
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
    const tokenResponse = await this.request<{ token: string }>(
      `/app/installations/${installationId}/access_tokens`,
      await this.createAppJwt(),
      { method: "POST" },
    );
    const repositories: GitHubRepository[] = [];

    for (let page = 1; ; page += 1) {
      const response = await this.request<{
        repositories: GitHubRepository[];
      }>(
        `/installation/repositories?per_page=100&page=${page}`,
        tokenResponse.token,
      );
      repositories.push(...response.repositories);
      if (response.repositories.length < 100) break;
    }

    return repositories;
  }

  private async createAppJwt(): Promise<string> {
    const appId = this.requireConfig("GITHUB_APP_ID");
    const encodedPrivateKey = this.requireConfig("GITHUB_APP_PRIVATE_KEY");
    const privateKey = Buffer.from(encodedPrivateKey, "base64").toString(
      "utf8",
    );
    const key = await importPKCS8(privateKey, "RS256");
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
