import { Injectable, Logger } from "@nestjs/common";
import type {
  ImpactExplanationFailureCode,
  ImpactExplanationGenerationMetadata,
} from "./explanation.types";
import type { StoredImpactReport } from "./impact.types";

interface ExplanationMetrics {
  attempts: number;
  successes: number;
  fallbacks: number;
  disabled: number;
  totalLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  fallbacksByCode: Partial<Record<ImpactExplanationFailureCode, number>>;
}

type ReportIdentity = Pick<
  StoredImpactReport,
  "id" | "workspaceId" | "repositoryId" | "sourceRevision"
>;

@Injectable()
export class ExplanationObservabilityService {
  private readonly logger = new Logger(ExplanationObservabilityService.name);
  private readonly metrics: ExplanationMetrics = {
    attempts: 0,
    successes: 0,
    fallbacks: 0,
    disabled: 0,
    totalLatencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    fallbacksByCode: {},
  };

  recordAttempt(report: ReportIdentity, evidencePacketHash: string): void {
    this.metrics.attempts += 1;
    this.logger.log({
      event: "impact_explanation_generation_started",
      ...this.identity(report),
      evidencePacketHash,
    });
  }

  recordSuccess(
    report: ReportIdentity,
    metadata: ImpactExplanationGenerationMetadata,
  ): void {
    this.metrics.successes += 1;
    this.recordUsage(metadata);
    this.logger.log({
      event: "impact_explanation_generation_completed",
      ...this.identity(report),
      ...this.safeMetadata(metadata),
    });
  }

  recordFallback(
    report: ReportIdentity,
    metadata: ImpactExplanationGenerationMetadata,
  ): void {
    this.metrics.fallbacks += 1;
    this.recordUsage(metadata);
    if (metadata.failureCode) {
      this.metrics.fallbacksByCode[metadata.failureCode] =
        (this.metrics.fallbacksByCode[metadata.failureCode] ?? 0) + 1;
    }
    this.logger.warn({
      event: "impact_explanation_generation_fallback",
      ...this.identity(report),
      ...this.safeMetadata(metadata),
    });
  }

  recordDisabled(report: ReportIdentity): void {
    this.metrics.disabled += 1;
    this.logger.log({
      event: "impact_explanation_generation_disabled",
      ...this.identity(report),
    });
  }

  snapshot(): ExplanationMetrics {
    return {
      ...this.metrics,
      fallbacksByCode: { ...this.metrics.fallbacksByCode },
    };
  }

  private recordUsage(metadata: ImpactExplanationGenerationMetadata): void {
    this.metrics.totalLatencyMs += metadata.latencyMs;
    this.metrics.inputTokens += metadata.usage.inputTokens;
    this.metrics.outputTokens += metadata.usage.outputTokens;
  }

  private identity(report: ReportIdentity) {
    return {
      reportId: report.id,
      workspaceId: report.workspaceId,
      repositoryId: report.repositoryId,
      sourceRevision: report.sourceRevision,
    };
  }

  private safeMetadata(metadata: ImpactExplanationGenerationMetadata) {
    return {
      provider: metadata.provider,
      model: metadata.model,
      promptVersion: metadata.promptVersion,
      outputSchemaVersion: metadata.outputSchemaVersion,
      evidencePacketHash: metadata.evidencePacketHash,
      generatedAt: metadata.generatedAt,
      latencyMs: metadata.latencyMs,
      inputTokens: metadata.usage.inputTokens,
      outputTokens: metadata.usage.outputTokens,
      totalTokens: metadata.usage.totalTokens,
      validationStatus: metadata.validationStatus,
      failureCode: metadata.failureCode,
      deterministicFallback: metadata.deterministicFallback,
    };
  }
}
