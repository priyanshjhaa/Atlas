import { Module } from "@nestjs/common";
import { ConnectorEncryptionService } from "./connector-encryption.service";
import { GitHubAppService } from "./github-app.service";
import { GitHubConnectorsController } from "./github-connectors.controller";
import { GitHubConnectorsRepository } from "./github-connectors.repository";
import { GitHubConnectorsService } from "./github-connectors.service";
import { GitHubWebhookVerifierService } from "./github-webhook-verifier.service";

@Module({
  controllers: [GitHubConnectorsController],
  providers: [
    ConnectorEncryptionService,
    GitHubAppService,
    GitHubConnectorsRepository,
    GitHubConnectorsService,
    GitHubWebhookVerifierService,
  ],
  exports: [GitHubAppService],
})
export class ConnectorsModule {}
