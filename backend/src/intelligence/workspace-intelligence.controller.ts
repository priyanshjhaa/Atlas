import { Body, Controller, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { WorkspaceRoles } from "../auth/auth.decorators";
import { WorkspaceIntelligenceSearchDto } from "./dto/workspace-intelligence-search.dto";
import { IntelligenceService } from "./intelligence.service";

@Controller("workspaces/:workspaceId/intelligence")
export class WorkspaceIntelligenceController {
  constructor(private readonly intelligence: IntelligenceService) {}

  @Post("search")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  search(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body() body: WorkspaceIntelligenceSearchDto,
  ) {
    return this.intelligence.workspaceSearch(
      workspaceId,
      body.query.trim(),
      {
        repositoryId: body.repositoryId,
        providers: body.providers,
      },
    );
  }
}
