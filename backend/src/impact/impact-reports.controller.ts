import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import {
  CurrentIdentity,
  WorkspaceRoles,
} from "../auth/auth.decorators";
import type { AuthenticatedIdentity } from "../auth/auth.types";
import { CreateImpactReportDto } from "./dto/create-impact-report.dto";
import { SubmitImpactFeedbackDto } from "./dto/submit-impact-feedback.dto";
import { ImpactReportsService } from "./impact-reports.service";

@Controller("workspaces/:workspaceId/impact-reports")
export class ImpactReportsController {
  constructor(private readonly reports: ImpactReportsService) {}

  @Post()
  @WorkspaceRoles("owner", "admin", "member")
  create(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body() body: CreateImpactReportDto,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    const input =
      body.mode === "planned"
        ? {
            mode: body.mode,
            repositoryId: body.repositoryId,
            description: (body.description ?? "").trim(),
            scope: body.scope,
            anchors: (body.anchors ?? []).map((anchor) => anchor.trim()),
          }
        : {
            mode: body.mode,
            repositoryId: body.repositoryId,
            pullRequestNumber: body.pullRequestNumber ?? 0,
            scope: body.scope,
          };
    return this.reports.create(workspaceId, input, identity);
  }

  @Get(":reportId")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  get(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    return this.reports.get(workspaceId, reportId, identity);
  }

  @Post(":reportId/explanation/retry")
  @WorkspaceRoles("owner", "admin", "member")
  retryExplanation(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("reportId", ParseUUIDPipe) reportId: string,
  ) {
    return this.reports.retryExplanation(workspaceId, reportId);
  }

  @Post(":reportId/feedback")
  @WorkspaceRoles("owner", "admin", "member")
  submitFeedback(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @Body() body: SubmitImpactFeedbackDto,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    return this.reports.submitFeedback(
      workspaceId,
      reportId,
      body,
      identity,
    );
  }
}
