import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import {
  CurrentIdentity,
  WorkspaceRoles,
} from "../auth/auth.decorators";
import type { AuthenticatedIdentity } from "../auth/auth.types";
import { NotionSyncJobsService } from "./notion-sync-jobs.service";

@Controller("workspaces/:workspaceId/connectors/notion/sync-jobs")
export class NotionSyncJobsController {
  constructor(private readonly jobs: NotionSyncJobsService) {}

  @Get()
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  list(@Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.jobs.list(workspaceId);
  }

  @Post()
  @HttpCode(202)
  @WorkspaceRoles("owner", "admin", "member")
  enqueue(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    return this.jobs.enqueue(workspaceId, idempotencyKey, identity);
  }
}
