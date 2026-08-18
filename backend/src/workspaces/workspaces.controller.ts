import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  CurrentIdentity,
  CurrentWorkspace,
  WorkspaceRoles,
} from "../auth/auth.decorators";
import type {
  AuthenticatedIdentity,
  WorkspaceAccess,
} from "../auth/auth.types";
import { AddMemberDto } from "./dto/add-member.dto";
import { CreateWorkspaceDto } from "./dto/create-workspace.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";
import { UpdateWorkspaceDto } from "./dto/update-workspace.dto";
import { WorkspacesService } from "./workspaces.service";

@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  create(
    @Body() body: CreateWorkspaceDto,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    return this.workspaces.create(body.name, identity);
  }

  @Get(":workspaceId")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  get(@Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.workspaces.get(workspaceId);
  }

  @Get(":workspaceId/overview")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  overview(@Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.workspaces.overview(workspaceId);
  }

  @Patch(":workspaceId")
  @WorkspaceRoles("owner", "admin")
  update(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body() body: UpdateWorkspaceDto,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    return this.workspaces.update(workspaceId, body.name, identity);
  }

  @Post(":workspaceId/onboarding/complete")
  @HttpCode(200)
  @WorkspaceRoles("owner", "admin")
  completeOnboarding(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    return this.workspaces.completeOnboarding(workspaceId, identity);
  }

  @Get(":workspaceId/members")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  listMembers(@Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.workspaces.listMembers(workspaceId);
  }

  @Get(":workspaceId/pilot-metrics")
  @WorkspaceRoles("owner", "admin")
  pilotMetrics(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
  ) {
    return this.workspaces.pilotMetrics(workspaceId);
  }

  @Delete(":workspaceId/pilot-metrics/expired-feedback")
  @WorkspaceRoles("owner", "admin")
  purgeExpiredPilotFeedback(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    return this.workspaces.purgeExpiredPilotFeedback(
      workspaceId,
      identity,
    );
  }

  @Post(":workspaceId/members")
  @WorkspaceRoles("owner", "admin")
  addMember(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body() body: AddMemberDto,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    return this.workspaces.addMember(
      workspaceId,
      body.email,
      body.role,
      identity,
    );
  }

  @Patch(":workspaceId/members/:memberId")
  @WorkspaceRoles("owner")
  updateMemberRole(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("memberId", ParseUUIDPipe) memberId: string,
    @Body() body: UpdateMemberRoleDto,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    return this.workspaces.updateMemberRole(
      workspaceId,
      memberId,
      body.role,
      identity,
    );
  }

  @Delete(":workspaceId/members/:memberId")
  @HttpCode(204)
  @WorkspaceRoles("owner", "admin")
  async removeMember(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("memberId", ParseUUIDPipe) memberId: string,
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @CurrentWorkspace() workspace: WorkspaceAccess,
  ): Promise<void> {
    await this.workspaces.removeMember(
      workspaceId,
      memberId,
      identity,
      workspace,
    );
  }

  @Get(":workspaceId/repositories")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  listRepositories(@Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.workspaces.listRepositories(workspaceId);
  }
}
