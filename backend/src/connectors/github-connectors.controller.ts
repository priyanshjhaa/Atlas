import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import {
  CurrentIdentity,
  Public,
  WorkspaceRoles,
} from "../auth/auth.decorators";
import type { AuthenticatedIdentity } from "../auth/auth.types";
import { InstallGitHubConnectorDto } from "./dto/install-github-connector.dto";
import { GitHubConnectorsService } from "./github-connectors.service";
import { GitHubWebhookVerifierService } from "./github-webhook-verifier.service";

interface GitHubWebhookRequest {
  rawBody?: Buffer;
}

@Controller()
export class GitHubConnectorsController {
  constructor(
    private readonly connectors: GitHubConnectorsService,
    private readonly webhookVerifier: GitHubWebhookVerifierService,
  ) {}

  @Get("workspaces/:workspaceId/connectors/github")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  list(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
  ) {
    return this.connectors.list(workspaceId);
  }

  @Post("workspaces/:workspaceId/connectors/github/installations")
  @WorkspaceRoles("owner", "admin")
  install(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body() body: InstallGitHubConnectorDto,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    return this.connectors.install(
      workspaceId,
      body.installationId,
      identity,
    );
  }

  @Public()
  @Post("webhooks/github")
  webhook(
    @Req() request: GitHubWebhookRequest,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Headers("x-github-delivery") deliveryId: string | undefined,
    @Headers("x-github-event") event: string | undefined,
  ) {
    if (!request.rawBody || !deliveryId || !event) {
      throw new BadRequestException("Incomplete GitHub webhook request.");
    }
    this.webhookVerifier.verify(request.rawBody, signature);

    let payload: unknown;
    try {
      payload = JSON.parse(request.rawBody.toString("utf8"));
    } catch {
      throw new BadRequestException("Invalid GitHub webhook payload.");
    }

    return this.connectors.handleWebhook(
      deliveryId,
      event,
      payload as { action?: string; installation?: { id?: number } },
    );
  }
}
