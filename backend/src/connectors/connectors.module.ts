import { Module } from "@nestjs/common";
import { ConnectorEncryptionService } from "./connector-encryption.service";
import { GitHubAppService } from "./github-app.service";
import { GitHubConnectorsController } from "./github-connectors.controller";
import { GitHubConnectorsRepository } from "./github-connectors.repository";
import { GitHubConnectorsService } from "./github-connectors.service";
import { GitHubWebhookVerifierService } from "./github-webhook-verifier.service";
import { NotionApiService } from "./notion-api.service";
import { NotionConnectorsController } from "./notion-connectors.controller";
import { NotionConnectorsRepository } from "./notion-connectors.repository";
import { NotionConnectorsService } from "./notion-connectors.service";

@Module({
  controllers: [GitHubConnectorsController, NotionConnectorsController],
  providers: [
    ConnectorEncryptionService,
    GitHubAppService,
    GitHubConnectorsRepository,
    GitHubConnectorsService,
    GitHubWebhookVerifierService,
    NotionApiService,
    NotionConnectorsRepository,
    NotionConnectorsService,
  ],
  exports: [GitHubAppService],
})
export class ConnectorsModule {}
