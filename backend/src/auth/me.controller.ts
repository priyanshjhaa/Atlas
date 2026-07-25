import { Controller, Get } from "@nestjs/common";
import { AuthRepository } from "./auth.repository";
import { CurrentIdentity } from "./auth.decorators";
import type { AuthenticatedIdentity, WorkspaceAccess } from "./auth.types";

interface MeResponse {
  user: AuthenticatedIdentity["user"];
  session: { id: string };
  workspaces: WorkspaceAccess[];
}

@Controller("me")
export class MeController {
  constructor(private readonly authRepository: AuthRepository) {}

  @Get()
  async getMe(
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ): Promise<MeResponse> {
    return {
      user: identity.user,
      session: { id: identity.sessionId },
      workspaces: await this.authRepository.listWorkspaces(identity.user.id),
    };
  }
}
