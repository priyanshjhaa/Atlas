import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { CurrentIdentity, WorkspaceRoles } from "../auth/auth.decorators";
import type { AuthenticatedIdentity } from "../auth/auth.types";
import { AcknowledgeNotionContextDto } from "./dto/acknowledge-notion-context.dto";
import { AskNotionQuestionDto } from "./dto/ask-notion-question.dto";
import { CreateNotionBriefingDto } from "./dto/create-notion-briefing.dto";
import { CreateNotionDocumentReviewDto } from "./dto/create-notion-document-review.dto";
import { NotionContextService } from "./notion-context.service";

@Controller("workspaces/:workspaceId/notion-context")
export class NotionContextController {
  constructor(private readonly context: NotionContextService) {}

  @Get("catch-up")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  catchUp(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ) {
    return this.context.catchUp(workspaceId, identity.user.id);
  }

  @Post("briefings")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  briefing(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body() body: CreateNotionBriefingDto,
  ) {
    return this.context.createBriefing(workspaceId, identity.user.id, body);
  }

  @Post("acknowledge")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  acknowledge(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body() body: AcknowledgeNotionContextDto,
  ) {
    return this.context.acknowledge(
      workspaceId,
      identity.user.id,
      body.acknowledgedThrough,
    );
  }

  @Post("questions")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  questions(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body() body: AskNotionQuestionDto,
  ) {
    return this.context.askQuestion(workspaceId, body.query.trim());
  }

  @Get("documents")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  documents(@Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.context.listReviewDocuments(workspaceId);
  }

  @Post("reviews")
  @WorkspaceRoles("owner", "admin", "member")
  reviews(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body() body: CreateNotionDocumentReviewDto,
  ) {
    return this.context.createDocumentReview(
      workspaceId,
      identity.user.id,
      body,
    );
  }

  @Get("reviews/:reviewId")
  @WorkspaceRoles("owner", "admin", "member", "viewer")
  review(
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Param("reviewId", ParseUUIDPipe) reviewId: string,
  ) {
    return this.context.getDocumentReview(workspaceId, reviewId);
  }
}
