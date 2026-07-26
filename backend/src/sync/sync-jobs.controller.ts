import {
  Body,
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
import { EnqueueSyncJobsDto } from "./dto/enqueue-sync-jobs.dto";
import { SyncJobsService } from "./sync-jobs.service";

@Controller("workspaces/:workspaceId/sync-jobs")
export class SyncJobsController {
  constructor(private readonly syncJobs: SyncJobsService) {}

  @Get()
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  list(@Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.syncJobs.list(workspaceId);
  }

  @Post()
  @HttpCode(202)
  @WorkspaceRoles("owner", "admin", "member")
  enqueue(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body() body: EnqueueSyncJobsDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    return this.syncJobs.enqueue(
      workspaceId,
      body.repositoryIds,
      idempotencyKey,
      identity,
    );
  }

  @Post(":syncJobId/cancel")
  @HttpCode(202)
  @WorkspaceRoles("owner", "admin", "member")
  cancel(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("syncJobId", ParseUUIDPipe) syncJobId: string,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    return this.syncJobs.cancel(workspaceId, syncJobId, identity);
  }

  @Post(":syncJobId/retry")
  @HttpCode(202)
  @WorkspaceRoles("owner", "admin", "member")
  retry(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("syncJobId", ParseUUIDPipe) syncJobId: string,
  ) {
    return this.syncJobs.retry(workspaceId, syncJobId);
  }
}
