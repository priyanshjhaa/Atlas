import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { parseWorkspaceId } from "../database/workspace-scope";
import { AuthRepository } from "./auth.repository";
import { WORKSPACE_ROLES_KEY } from "./auth.decorators";
import type { AtlasRequest, WorkspaceRole } from "./auth.types";

@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authRepository: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<WorkspaceRole[]>(
      WORKSPACE_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles) return true;

    const request = context.switchToHttp().getRequest<AtlasRequest>();
    const header = request.headers["x-atlas-workspace-id"];
    const headerWorkspaceId = Array.isArray(header) ? header[0] : header;
    const parameterWorkspaceId = request.params?.workspaceId;
    const untrustedWorkspaceId = parameterWorkspaceId ?? headerWorkspaceId;

    if (!request.auth || !untrustedWorkspaceId) {
      throw new ForbiddenException("A workspace context is required.");
    }

    if (
      parameterWorkspaceId &&
      headerWorkspaceId &&
      parameterWorkspaceId !== headerWorkspaceId
    ) {
      throw new ForbiddenException("Workspace contexts do not match.");
    }

    let workspaceId: string;
    try {
      workspaceId = parseWorkspaceId(untrustedWorkspaceId);
    } catch {
      throw new ForbiddenException("The workspace context is invalid.");
    }

    const access = await this.authRepository.findWorkspaceAccess(
      request.auth.user.id,
      workspaceId,
    );

    if (!access || !roles.includes(access.role)) {
      throw new ForbiddenException(
        "The current user does not have the required workspace role.",
      );
    }

    request.workspace = access;
    return true;
  }
}
