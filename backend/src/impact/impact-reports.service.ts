import { Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedIdentity } from "../auth/auth.types";
import { ExplanationGenerationService } from "./explanation-generation.service";
import { ImpactAnalysisService } from "./impact-analysis.service";
import { ImpactRepository } from "./impact.repository";
import type { CreateImpactReportInput } from "./impact.types";
import type { SubmitImpactFeedbackDto } from "./dto/submit-impact-feedback.dto";
import { PullRequestResolverService } from "./pull-request-resolver.service";

@Injectable()
export class ImpactReportsService {
  constructor(
    private readonly analysis: ImpactAnalysisService,
    private readonly repository: ImpactRepository,
    private readonly pullRequests: PullRequestResolverService,
    private readonly explanations: ExplanationGenerationService,
  ) {}

  async create(
    workspaceId: string,
    request: CreateImpactReportInput,
    identity: AuthenticatedIdentity,
  ) {
    const input =
      request.mode === "planned"
        ? {
            mode: request.mode,
            repositoryId: request.repositoryId,
            description: request.description,
            scope: request.scope,
            anchors: request.anchors,
          }
        : await this.pullRequests.resolve(
            workspaceId,
            request.repositoryId,
            request.pullRequestNumber,
            request.scope,
          );
    const result = await this.analysis.analyze(workspaceId, input);
    const report = await this.repository.create({
      workspaceId,
      repositoryId: input.repositoryId,
      requestedByUserId: identity.user.id,
      sourceRevision: result.sourceRevision,
      request: input,
      result,
    });
    return this.explanations.generate(report);
  }

  async get(workspaceId: string, reportId: string) {
    const report = await this.repository.findById(workspaceId, reportId);
    if (!report) throw new NotFoundException("Impact report not found.");
    return report;
  }

  async retryExplanation(workspaceId: string, reportId: string) {
    const report = await this.repository.findById(workspaceId, reportId);
    if (!report) throw new NotFoundException("Impact report not found.");
    return this.explanations.generate(report, { retryPending: true });
  }

  async submitFeedback(
    workspaceId: string,
    reportId: string,
    feedback: SubmitImpactFeedbackDto,
    identity: AuthenticatedIdentity,
  ) {
    const saved = await this.repository.upsertFeedback({
      workspaceId,
      reportId,
      submittedByUserId: identity.user.id,
      rating: feedback.rating,
      confirmedFindingIds: [
        ...new Set(feedback.confirmedFindingIds ?? []),
      ],
      missedImpact: feedback.missedImpact?.trim() || null,
      comment: feedback.comment?.trim() || null,
    });
    if (!saved) throw new NotFoundException("Impact report not found.");
    return saved;
  }
}
