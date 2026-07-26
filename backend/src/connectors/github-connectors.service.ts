import { Injectable } from "@nestjs/common";
import type { AuthenticatedIdentity } from "../auth/auth.types";
import { ConnectorEncryptionService } from "./connector-encryption.service";
import { GitHubAppService } from "./github-app.service";
import { GitHubConnectorsRepository } from "./github-connectors.repository";

interface GitHubWebhookPayload {
  action?: string;
  installation?: { id?: number };
}

@Injectable()
export class GitHubConnectorsService {
  constructor(
    private readonly github: GitHubAppService,
    private readonly encryption: ConnectorEncryptionService,
    private readonly repository: GitHubConnectorsRepository,
  ) {}

  list(workspaceId: string) {
    return this.repository.list(workspaceId);
  }

  async install(
    workspaceId: string,
    installationId: string,
    identity: AuthenticatedIdentity,
  ) {
    const installation = await this.github.getInstallation(installationId);
    const repositories =
      await this.github.listInstallationRepositories(installationId);
    const encryptedSnapshot = this.encryption.encrypt({
      installationId,
      account: installation.account,
      permissions: installation.permissions,
      repositorySelection: installation.repository_selection,
    });

    const connector = await this.repository.install(
      workspaceId,
      identity.user.id,
      installation,
      encryptedSnapshot,
      repositories,
    );

    return {
      id: connector.id,
      status: connector.status,
      installationId: connector.providerInstallationId,
      configuration: connector.configuration,
      repositoryCount: repositories.length,
    };
  }

  async handleWebhook(
    deliveryId: string,
    event: string,
    payload: GitHubWebhookPayload,
  ): Promise<{ accepted: true; duplicate?: true }> {
    const claimed = await this.repository.claimDelivery(deliveryId, event);
    if (!claimed) return { accepted: true, duplicate: true };

    const installationId = payload.installation?.id;
    if (!installationId) return { accepted: true };

    const connector = await this.repository.findByInstallationId(
      String(installationId),
    );
    if (!connector) return { accepted: true };

    if (
      event === "installation" &&
      (payload.action === "deleted" || payload.action === "suspend")
    ) {
      await this.repository.revoke(connector);
      return { accepted: true };
    }

    if (
      event === "installation_repositories" ||
      (event === "installation" &&
        ["created", "new_permissions_accepted", "unsuspend"].includes(
          payload.action ?? "",
        ))
    ) {
      const repositories = await this.github.listInstallationRepositories(
        String(installationId),
      );
      await this.repository.syncRepositories(connector, repositories);
    }

    return { accepted: true };
  }
}
