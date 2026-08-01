import { Injectable } from "@nestjs/common";
import type { AuthenticatedIdentity } from "../auth/auth.types";
import { ConnectorEncryptionService } from "./connector-encryption.service";
import { NotionApiService } from "./notion-api.service";
import { NotionConnectorsRepository } from "./notion-connectors.repository";

@Injectable()
export class NotionConnectorsService {
  constructor(
    private readonly notion: NotionApiService,
    private readonly encryption: ConnectorEncryptionService,
    private readonly repository: NotionConnectorsRepository,
  ) {}

  list(workspaceId: string) {
    return this.repository.list(workspaceId);
  }

  resources(workspaceId: string) {
    return this.repository.listResources(workspaceId);
  }

  async connect(
    workspaceId: string,
    code: string,
    identity: AuthenticatedIdentity,
  ) {
    const token = await this.notion.exchangeAuthorizationCode(code);
    const resources = await this.notion.listAccessibleResources(
      token.access_token,
    );
    const encryptedCredentials = this.encryption.encrypt({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      botId: token.bot_id,
      notionWorkspaceId: token.workspace_id,
    });
    const connector = await this.repository.install(
      workspaceId,
      identity.user.id,
      token,
      encryptedCredentials,
      resources,
    );
    return {
      id: connector.id,
      status: connector.status,
      configuration: connector.configuration,
      resourceCount: resources.length,
    };
  }

  async updateSelection(
    workspaceId: string,
    resourceIds: string[],
    identity: AuthenticatedIdentity,
  ) {
    await this.repository.updateSelection(
      workspaceId,
      resourceIds,
      identity.user.id,
    );
    return { selectedResourceCount: resourceIds.length };
  }

  async disconnect(
    workspaceId: string,
    identity: AuthenticatedIdentity,
  ) {
    await this.repository.revoke(workspaceId, identity.user.id);
    return { status: "revoked" as const };
  }
}
