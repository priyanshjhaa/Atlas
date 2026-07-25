import { createParamDecorator, SetMetadata } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type {
  AtlasRequest,
  AuthenticatedIdentity,
  WorkspaceRole,
} from "./auth.types";

export const IS_PUBLIC_KEY = "atlas:is-public";
export const WORKSPACE_ROLES_KEY = "atlas:workspace-roles";

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const WorkspaceRoles = (...roles: WorkspaceRole[]) =>
  SetMetadata(WORKSPACE_ROLES_KEY, roles);

export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedIdentity => {
    const request = context.switchToHttp().getRequest<AtlasRequest>();

    if (!request.auth) {
      throw new Error("CurrentIdentity used without authentication.");
    }

    return request.auth;
  },
);
