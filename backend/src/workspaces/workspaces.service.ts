import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment";
import type {
  AuthenticatedIdentity,
  WorkspaceAccess,
  WorkspaceRole,
} from "../auth/auth.types";
import {
  WorkspacesRepository,
  type MemberRecord,
  type RepositoryRecord,
  type WorkspaceRecord,
} from "./workspaces.repository";

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly workspaces: WorkspacesRepository,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  create(
    name: string,
    identity: AuthenticatedIdentity,
  ): Promise<WorkspaceRecord> {
    return this.workspaces.create(name.trim(), identity.user.id);
  }

  async get(workspaceId: string): Promise<WorkspaceRecord> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) throw new NotFoundException("Workspace not found.");
    return workspace;
  }

  async update(
    workspaceId: string,
    name: string,
    identity: AuthenticatedIdentity,
  ): Promise<WorkspaceRecord> {
    const workspace = await this.workspaces.update(
      workspaceId,
      name.trim(),
      identity.user.id,
    );
    if (!workspace) throw new NotFoundException("Workspace not found.");
    return workspace;
  }

  listMembers(workspaceId: string): Promise<MemberRecord[]> {
    return this.workspaces.listMembers(workspaceId);
  }

  async addMember(
    workspaceId: string,
    email: string,
    role: Exclude<WorkspaceRole, "owner">,
    identity: AuthenticatedIdentity,
  ): Promise<MemberRecord> {
    const member = await this.workspaces.addMember(
      workspaceId,
      email.trim().toLowerCase(),
      role,
      identity.user.id,
    );
    if (!member) {
      throw new ConflictException(
        "The user has not signed in to Atlas or is already a member.",
      );
    }
    return member;
  }

  async updateMemberRole(
    workspaceId: string,
    memberId: string,
    role: Exclude<WorkspaceRole, "owner">,
    identity: AuthenticatedIdentity,
  ): Promise<MemberRecord> {
    const target = await this.requireMember(workspaceId, memberId);
    if (target.role === "owner") {
      throw new ForbiddenException("The workspace owner cannot be demoted.");
    }

    const member = await this.workspaces.updateMemberRole(
      workspaceId,
      memberId,
      role,
      identity.user.id,
    );
    if (!member) throw new NotFoundException("Workspace member not found.");
    return member;
  }

  async removeMember(
    workspaceId: string,
    memberId: string,
    identity: AuthenticatedIdentity,
    actorWorkspace: WorkspaceAccess,
  ): Promise<void> {
    const target = await this.requireMember(workspaceId, memberId);
    if (target.role === "owner") {
      throw new ForbiddenException("The workspace owner cannot be removed.");
    }
    if (actorWorkspace.role === "admin" && target.role === "admin") {
      throw new ForbiddenException("Admins cannot remove other admins.");
    }

    const removed = await this.workspaces.removeMember(
      workspaceId,
      memberId,
      identity.user.id,
    );
    if (!removed) throw new NotFoundException("Workspace member not found.");
  }

  listRepositories(workspaceId: string): Promise<RepositoryRecord[]> {
    return this.workspaces.listRepositories(workspaceId);
  }

  pilotMetrics(workspaceId: string) {
    return this.workspaces.pilotMetrics(workspaceId);
  }

  purgeExpiredPilotFeedback(
    workspaceId: string,
    identity: AuthenticatedIdentity,
  ) {
    const retentionDays = this.config.get(
      "PILOT_FEEDBACK_RETENTION_DAYS",
      { infer: true },
    );
    const cutoff = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1_000,
    );
    return this.workspaces.purgeExpiredPilotFeedback(
      workspaceId,
      cutoff,
      identity.user.id,
    );
  }

  private async requireMember(
    workspaceId: string,
    memberId: string,
  ): Promise<MemberRecord> {
    const member = await this.workspaces.findMember(workspaceId, memberId);
    if (!member) throw new NotFoundException("Workspace member not found.");
    return member;
  }
}
