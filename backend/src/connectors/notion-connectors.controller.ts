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
  WorkspaceRoles,
} from "../auth/auth.decorators";
import type { AuthenticatedIdentity } from "../auth/auth.types";
import { ExchangeNotionCodeDto } from "./dto/exchange-notion-code.dto";
import { UpdateNotionSelectionDto } from "./dto/update-notion-selection.dto";
import { NotionConnectorsService } from "./notion-connectors.service";

@Controller("workspaces/:workspaceId/connectors/notion")
export class NotionConnectorsController {
  constructor(private readonly connectors: NotionConnectorsService) {}

  @Get()
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  list(@Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.connectors.list(workspaceId);
  }

  @Get("resources")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  resources(@Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.connectors.resources(workspaceId);
  }

  @Post("oauth")
  @WorkspaceRoles("owner", "admin")
  connect(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body() body: ExchangeNotionCodeDto,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    return this.connectors.connect(workspaceId, body.code, identity);
  }

  @Patch("resources")
  @WorkspaceRoles("owner", "admin")
  updateSelection(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body() body: UpdateNotionSelectionDto,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    return this.connectors.updateSelection(
      workspaceId,
      body.resourceIds,
      identity,
    );
  }

  @Delete()
  @HttpCode(200)
  @WorkspaceRoles("owner", "admin")
  disconnect(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    return this.connectors.disconnect(workspaceId, identity);
  }
}
