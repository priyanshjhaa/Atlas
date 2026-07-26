import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { WorkspaceRoles } from "../auth/auth.decorators";
import { IntelligenceSearchDto } from "./dto/intelligence-search.dto";
import { IntelligenceService } from "./intelligence.service";

@Controller(
  "workspaces/:workspaceId/repositories/:repositoryId/intelligence",
)
export class IntelligenceController {
  constructor(private readonly intelligence: IntelligenceService) {}

  @Get("architecture")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  architecture(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("repositoryId", ParseUUIDPipe) repositoryId: string,
  ) {
    return this.intelligence.architecture(workspaceId, repositoryId);
  }

  @Post("search")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  search(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("repositoryId", ParseUUIDPipe) repositoryId: string,
    @Body() body: IntelligenceSearchDto,
  ) {
    return this.intelligence.search(workspaceId, repositoryId, body.query);
  }
}
