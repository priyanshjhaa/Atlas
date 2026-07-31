import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { WorkspaceRoles } from "../auth/auth.decorators";
import { GraphTraversalQueryDto } from "./dto/graph-traversal-query.dto";
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

  @Get("graph")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  graph(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("repositoryId", ParseUUIDPipe) repositoryId: string,
    @Query() query: GraphTraversalQueryDto,
  ) {
    return this.intelligence.graph(workspaceId, repositoryId, query);
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
