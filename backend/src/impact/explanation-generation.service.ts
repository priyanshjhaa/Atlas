import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment";
import type { ImpactEvidencePacket } from "./evidence-packet.types";
import { EvidencePacketBuilder } from "./evidence-packet.builder";
import { ExplanationGroundingValidator } from "./explanation-grounding.validator";
import { ExplanationObservabilityService } from "./explanation-observability.service";
import type { ExplanationGenerationMetadata } from "./explanation-client.types";
import { IMPACT_EXPLANATION_PROMPT_VERSION } from "./explanation.prompt";
import {
  IMPACT_EXPLANATION_SCHEMA_VERSION,
  type ImpactExplanation,
  type ImpactExplanationFailureCode,
  type ImpactExplanationGenerationMetadata,
  type ImpactExplanationState,
} from "./explanation.types";
import { ImpactRepository } from "./impact.repository";
import type { StoredImpactReport } from "./impact.types";
import { OpenAIExplanationClient } from "./openai-explanation.client";

@Injectable()
export class ExplanationGenerationService {
  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly packets: EvidencePacketBuilder,
    private readonly client: OpenAIExplanationClient,
    private readonly validator: ExplanationGroundingValidator,
    private readonly repository: ImpactRepository,
    private readonly observability: ExplanationObservabilityService,
  ) {}

  async generate(
    report: StoredImpactReport,
    options: { retryPending?: boolean } = {},
  ): Promise<StoredImpactReport> {
    if (!this.config.get("LLM_EXPLANATIONS_ENABLED", { infer: true })) {
      if (report.explanation?.status === "completed") return report;
      const disabled = await this.persist(report, {
        status: "disabled",
        schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
      });
      this.observability.recordDisabled(disabled);
      return disabled;
    }

    let packetResult;
    try {
      packetResult = this.packets.build(report.input, report.result, {
        maxEvidenceItems: this.config.get("LLM_MAX_EVIDENCE_ITEMS", {
          infer: true,
        }),
        maxEvidenceCharacters: this.config.get(
          "LLM_MAX_EVIDENCE_CHARACTERS",
          { infer: true },
        ),
        maxPacketCharacters: this.config.get(
          "LLM_MAX_PACKET_CHARACTERS",
          { infer: true },
        ),
      });
    } catch {
      return this.persistFailure(
        report,
        "generation_failed",
        null,
        0,
        "not_run",
        undefined,
        false,
      );
    }
    if (packetResult.status === "insufficient_evidence") {
      return this.persistFailure(
        report,
        packetResult.reason,
        null,
        0,
        "not_run",
        undefined,
        false,
      );
    }

    if (
      report.explanation?.status === "completed" &&
      report.explanation.metadata?.evidencePacketHash ===
        packetResult.evidencePacketHash &&
      report.explanation.metadata.promptVersion ===
        IMPACT_EXPLANATION_PROMPT_VERSION &&
      report.explanation.metadata.outputSchemaVersion ===
        IMPACT_EXPLANATION_SCHEMA_VERSION &&
      report.explanation.metadata.sourceRevision === report.sourceRevision
    ) {
      return report;
    }
    if (
      !options.retryPending &&
      report.explanation?.status === "pending" &&
      report.explanation.evidencePacketHash ===
        packetResult.evidencePacketHash &&
      report.explanation.promptVersion === IMPACT_EXPLANATION_PROMPT_VERSION
    ) {
      return report;
    }

    this.observability.recordAttempt(
      report,
      packetResult.evidencePacketHash,
    );
    const pending = await this.persist(report, {
      status: "pending",
      schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
      evidencePacketHash: packetResult.evidencePacketHash,
      promptVersion: IMPACT_EXPLANATION_PROMPT_VERSION,
      sourceRevision: report.sourceRevision,
      startedAt: new Date().toISOString(),
    });

    try {
      const generated = await this.client.generate(packetResult.packet);
      if (generated.status === "disabled") {
        const disabled = await this.persist(pending, {
          status: "disabled",
          schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
        });
        this.observability.recordDisabled(disabled);
        return disabled;
      }
      if (generated.status === "failed") {
        return this.persistFailure(
          pending,
          generated.failureCode,
          packetResult.evidencePacketHash,
          generated.latencyMs,
          "not_run",
          this.failedGenerationMetadata(generated),
        );
      }

      let completedGeneration = generated;
      let checked = this.validateWithSafeRepairs(
        completedGeneration.explanation,
        packetResult.packet,
      );
      completedGeneration = {
        ...completedGeneration,
        explanation: checked.explanation,
      };
      let validation = checked.validation;
      if (
        validation.status === "invalid" &&
        this.canRepair(validation.failureCode)
      ) {
        const repaired = await this.client.generate(packetResult.packet, {
          repair: {
            candidate: completedGeneration.explanation,
            failureCode: validation.failureCode,
          },
        });
        if (repaired.status === "completed") {
          completedGeneration = {
            ...repaired,
            metadata: this.combinedGenerationMetadata(
              completedGeneration.metadata,
              repaired.metadata,
            ),
          };
          checked = this.validateWithSafeRepairs(
            completedGeneration.explanation,
            packetResult.packet,
          );
          completedGeneration = {
            ...completedGeneration,
            explanation: checked.explanation,
          };
          validation = checked.validation;
        }
      }
      if (validation.status === "invalid") {
        return this.persistFailure(
          pending,
          validation.failureCode,
          packetResult.evidencePacketHash,
          completedGeneration.metadata.latencyMs,
          "invalid",
          completedGeneration.metadata,
        );
      }

      const metadata = this.metadata(
        pending,
        packetResult.evidencePacketHash,
        completedGeneration.metadata.latencyMs,
        "valid",
        false,
        null,
        completedGeneration.metadata,
      );
      const completed = await this.persist(pending, {
        status: "completed",
        schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
        explanation: validation.explanation,
        metadata,
      });
      this.observability.recordSuccess(completed, metadata);
      return completed;
    } catch {
      return this.persistFailure(
        pending,
        "generation_failed",
        packetResult.evidencePacketHash,
        0,
        "not_run",
      );
    }
  }

  private validateWithSafeRepairs(
    explanation: ImpactExplanation,
    packet: ImpactEvidencePacket,
  ) {
    let candidate = explanation;
    let validation = this.validator.validate(candidate, packet);
    if (
      validation.status === "invalid" &&
      validation.failureCode === "unknown_file_path"
    ) {
      candidate = this.validator.repairUnknownFilePaths(candidate, packet);
      validation = this.validator.validate(candidate, packet);
    }
    return { explanation: candidate, validation };
  }

  private canRepair(failureCode: ImpactExplanationFailureCode): boolean {
    return (
      failureCode === "unknown_file_path" ||
      failureCode === "unknown_symbol" ||
      failureCode === "unsupported_relationship"
    );
  }

  private combinedGenerationMetadata(
    initial: ExplanationGenerationMetadata,
    repaired: ExplanationGenerationMetadata,
  ): ExplanationGenerationMetadata {
    return {
      ...repaired,
      latencyMs: initial.latencyMs + repaired.latencyMs,
      usage: {
        inputTokens:
          initial.usage.inputTokens + repaired.usage.inputTokens,
        outputTokens:
          initial.usage.outputTokens + repaired.usage.outputTokens,
        totalTokens:
          initial.usage.totalTokens + repaired.usage.totalTokens,
      },
      attempts: [
        ...(initial.attempts ?? []),
        ...(repaired.attempts ?? []),
      ],
    };
  }

  private failedGenerationMetadata(
    result: Extract<
      Awaited<ReturnType<OpenAIExplanationClient["generate"]>>,
      { status: "failed" }
    >,
  ): ExplanationGenerationMetadata | undefined {
    const lastAttempt = result.attempts?.at(-1);
    if (!lastAttempt) return undefined;
    return {
      provider: lastAttempt.provider,
      model: lastAttempt.model,
      promptVersion: IMPACT_EXPLANATION_PROMPT_VERSION,
      outputSchemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
      latencyMs: result.latencyMs,
      usage: result.usage,
      attempts: result.attempts,
    };
  }

  private async persistFailure(
    report: StoredImpactReport,
    failureCode: ImpactExplanationFailureCode,
    evidencePacketHash: string | null,
    latencyMs: number,
    validationStatus: ImpactExplanationGenerationMetadata["validationStatus"],
    generation?: ExplanationGenerationMetadata,
    providerAttempted = true,
  ): Promise<StoredImpactReport> {
    const metadata = this.metadata(
      report,
      evidencePacketHash,
      latencyMs,
      validationStatus,
      true,
      failureCode,
      generation,
      providerAttempted,
    );
    const failed = await this.persist(report, {
      status: "failed",
      schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
      failureCode,
      metadata,
    });
    this.observability.recordFallback(failed, metadata);
    return failed;
  }

  private metadata(
    report: StoredImpactReport,
    evidencePacketHash: string | null,
    latencyMs: number,
    validationStatus: ImpactExplanationGenerationMetadata["validationStatus"],
    deterministicFallback: boolean,
    failureCode: ImpactExplanationFailureCode | null,
    generation?: ExplanationGenerationMetadata,
    providerAttempted = true,
  ): ImpactExplanationGenerationMetadata {
    return {
      provider:
        generation?.provider ??
        (providerAttempted
          ? this.config.get("LLM_PROVIDER", { infer: true })
          : null),
      model:
        generation?.model ??
        (providerAttempted
          ? this.config.get("LLM_EXPLANATION_MODEL", { infer: true })
          : null) ??
        null,
      promptVersion:
        generation?.promptVersion ?? IMPACT_EXPLANATION_PROMPT_VERSION,
      outputSchemaVersion:
        generation?.outputSchemaVersion ??
        IMPACT_EXPLANATION_SCHEMA_VERSION,
      evidencePacketHash,
      sourceRevision: report.sourceRevision,
      generatedAt: new Date().toISOString(),
      latencyMs,
      usage: generation?.usage ?? {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
      attempts: generation?.attempts,
      validationStatus,
      failureCode,
      deterministicFallback,
    };
  }

  private async persist(
    report: StoredImpactReport,
    explanation: ImpactExplanationState,
  ): Promise<StoredImpactReport> {
    try {
      return (
        (await this.repository.updateExplanation(
          report.workspaceId,
          report.id,
          explanation,
          report.requestedByUserId,
        )) ?? { ...report, explanation }
      );
    } catch {
      return { ...report, explanation };
    }
  }
}
