import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import {
  type Environment,
  validateEnvironment,
} from "../src/config/environment";
import type { EvidencePacketBuilder } from "../src/impact/evidence-packet.builder";
import type { ImpactEvidencePacket } from "../src/impact/evidence-packet.types";
import { IMPACT_EVIDENCE_PACKET_VERSION } from "../src/impact/evidence-packet.types";
import { ExplanationGenerationService } from "../src/impact/explanation-generation.service";
import type { ExplanationGroundingValidator } from "../src/impact/explanation-grounding.validator";
import type { ExplanationObservabilityService } from "../src/impact/explanation-observability.service";
import { IMPACT_EXPLANATION_PROMPT_VERSION } from "../src/impact/explanation.prompt";
import {
  IMPACT_EXPLANATION_SCHEMA_VERSION,
  type ImpactExplanationState,
} from "../src/impact/explanation.types";
import type { ImpactRepository } from "../src/impact/impact.repository";
import type { StoredImpactReport } from "../src/impact/impact.types";
import type { OpenAIExplanationClient } from "../src/impact/openai-explanation.client";

const packet: ImpactEvidencePacket = {
  packetVersion: IMPACT_EVIDENCE_PACKET_VERSION,
  question: "Rotate sessions.",
  analysisMode: "planned",
  analysisStatus: "complete",
  atlasAssessment: {
    answer: "Update the session boundary.",
    executiveSummary: "One observed consumer is affected.",
    recommendations: ["Preserve the consumer contract."],
    verificationPlan: ["Exercise the observed consumer."],
  },
  repository: { id: "repository-1", owner: "atlas", name: "identity" },
  sourceRevision: "revision-1",
  risk: { level: "medium", score: 50, reasons: ["Observed consumer."] },
  directImpacts: [],
  downstreamImpacts: [],
  unknownImpacts: [],
  relationshipPaths: [],
  evidence: [],
  limitations: [],
};

const explanation = {
  schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
  executiveSummary: "A grounded summary.",
  answer: "A grounded answer.",
  claims: [{ text: "A grounded claim.", evidenceIds: ["chunk:1"] }],
  implementationSteps: [
    {
      title: "Update the boundary",
      detail: "Preserve its contract.",
      evidenceIds: ["chunk:1"],
    },
  ],
  verificationSteps: [
    { text: "Verify the consumer.", evidenceIds: ["relationship:1"] },
  ],
  remainingQuestions: [],
};

function report(explanationState?: ImpactExplanationState | null) {
  return {
    id: "report-1",
    workspaceId: "workspace-1",
    repositoryId: "repository-1",
    requestedByUserId: "user-1",
    sourceRevision: "revision-1",
    input: {
      mode: "planned",
      repositoryId: "repository-1",
      description: "Rotate sessions.",
      scope: "repository",
      anchors: [],
    },
    result: {
      status: "complete",
      sourceRevision: "revision-1",
    },
    explanation: explanationState ?? null,
    createdAt: new Date("2026-07-29T00:00:00.000Z"),
    updatedAt: new Date("2026-07-29T00:00:00.000Z"),
  } as unknown as StoredImpactReport;
}

function config(enabled: boolean): ConfigService<Environment, true> {
  return new ConfigService<Environment>(
    validateEnvironment(
      enabled
        ? {
            LLM_EXPLANATIONS_ENABLED: "true",
            LLM_EXPLANATION_MODEL: "configured-model",
            OPENAI_API_KEY: "test-key",
          }
        : { LLM_EXPLANATIONS_ENABLED: "false" },
    ),
  ) as unknown as ConfigService<Environment, true>;
}

function setup(options: {
  enabled?: boolean;
  packetResult?: unknown;
  clientResult?: unknown;
  repairResult?: unknown;
  validationResult?: unknown;
  repairValidationResult?: unknown;
  initialExplanation?: ImpactExplanationState | null;
} = {}) {
  const storedReport = report(options.initialExplanation);
  const packets = {
    build: vi.fn().mockReturnValue(
      options.packetResult ?? {
        status: "ready",
        packet,
        evidencePacketHash: "packet-hash",
      },
    ),
  };
  const defaultClientResult = {
    status: "completed",
    explanation,
    metadata: {
      provider: "openai",
      model: "configured-model",
      promptVersion: IMPACT_EXPLANATION_PROMPT_VERSION,
      outputSchemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
      latencyMs: 25,
      usage: {
        inputTokens: 100,
        outputTokens: 40,
        totalTokens: 140,
      },
    },
  };
  const generate = vi
    .fn()
    .mockResolvedValue(options.clientResult ?? defaultClientResult);
  if (options.repairResult !== undefined) {
    generate
      .mockResolvedValueOnce(options.clientResult ?? defaultClientResult)
      .mockResolvedValueOnce(options.repairResult);
  }
  const client = {
    generate,
  };
  const defaultValidationResult = {
    status: "valid",
    explanation,
  };
  const validate = vi
    .fn()
    .mockReturnValue(options.validationResult ?? defaultValidationResult);
  if (options.repairValidationResult !== undefined) {
    validate
      .mockReturnValueOnce(
        options.validationResult ?? defaultValidationResult,
      )
      .mockReturnValueOnce(options.repairValidationResult);
  }
  const validator = {
    validate,
  };
  const repository = {
    updateExplanation: vi
      .fn()
      .mockImplementation(
        async (
          _workspaceId: string,
          _reportId: string,
          state: ImpactExplanationState,
        ) => ({ ...storedReport, explanation: state }),
      ),
  };
  const observability = {
    recordAttempt: vi.fn(),
    recordSuccess: vi.fn(),
    recordFallback: vi.fn(),
    recordDisabled: vi.fn(),
  };
  const service = new ExplanationGenerationService(
    config(options.enabled ?? true),
    packets as unknown as EvidencePacketBuilder,
    client as unknown as OpenAIExplanationClient,
    validator as unknown as ExplanationGroundingValidator,
    repository as unknown as ImpactRepository,
    observability as unknown as ExplanationObservabilityService,
  );
  return {
    service,
    report: storedReport,
    packets,
    client,
    validator,
    repository,
    observability,
  };
}

describe("ExplanationGenerationService", () => {
  it("persists pending then a validated completed explanation", async () => {
    const {
      service,
      report: stored,
      client,
      validator,
      repository,
      observability,
    } = setup();

    const result = await service.generate(stored);

    expect(client.generate).toHaveBeenCalledOnce();
    expect(validator.validate).toHaveBeenCalledWith(explanation, packet);
    expect(repository.updateExplanation).toHaveBeenCalledTimes(2);
    expect(repository.updateExplanation.mock.calls[0]?.[2]).toMatchObject({
      status: "pending",
      evidencePacketHash: "packet-hash",
      promptVersion: IMPACT_EXPLANATION_PROMPT_VERSION,
    });
    expect(repository.updateExplanation).toHaveBeenLastCalledWith(
      "workspace-1",
      "report-1",
      expect.objectContaining({ status: "completed" }),
      "user-1",
    );
    expect(observability.recordAttempt).toHaveBeenCalledWith(
      stored,
      "packet-hash",
    );
    expect(observability.recordSuccess).toHaveBeenCalledOnce();
    expect(result.explanation).toMatchObject({
      status: "completed",
      explanation,
      metadata: {
        evidencePacketHash: "packet-hash",
        sourceRevision: "revision-1",
        validationStatus: "valid",
        failureCode: null,
        deterministicFallback: false,
        usage: { totalTokens: 140 },
      },
    });
  });

  it("does not build a packet or call a provider when disabled", async () => {
    const { service, report: stored, packets, client } = setup({
      enabled: false,
    });

    const result = await service.generate(stored);

    expect(result.explanation).toEqual({
      status: "disabled",
      schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
    });
    expect(packets.build).not.toHaveBeenCalled();
    expect(client.generate).not.toHaveBeenCalled();
  });

  it("reuses an unchanged completed explanation", async () => {
    const completed: ImpactExplanationState = {
      status: "completed",
      schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
      explanation,
      metadata: {
        provider: "openai",
        model: "configured-model",
        promptVersion: IMPACT_EXPLANATION_PROMPT_VERSION,
        outputSchemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
        evidencePacketHash: "packet-hash",
        sourceRevision: "revision-1",
        generatedAt: "2026-07-29T00:00:00.000Z",
        latencyMs: 25,
        usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
        validationStatus: "valid",
        failureCode: null,
        deterministicFallback: false,
      },
    };
    const { service, report: stored, client, repository } = setup({
      initialExplanation: completed,
    });

    await expect(service.generate(stored)).resolves.toBe(stored);
    expect(client.generate).not.toHaveBeenCalled();
    expect(repository.updateExplanation).not.toHaveBeenCalled();
  });

  it("keeps an active pending request idempotent but permits explicit retry", async () => {
    const pending: ImpactExplanationState = {
      status: "pending",
      schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
      evidencePacketHash: "packet-hash",
      promptVersion: IMPACT_EXPLANATION_PROMPT_VERSION,
      sourceRevision: "revision-1",
      startedAt: "2026-07-29T00:00:00.000Z",
    };
    const { service, report: stored, client } = setup({
      initialExplanation: pending,
    });

    await expect(service.generate(stored)).resolves.toBe(stored);
    expect(client.generate).not.toHaveBeenCalled();

    await service.generate(stored, { retryPending: true });
    expect(client.generate).toHaveBeenCalledOnce();
  });

  it("persists provider and validation failures without generated prose", async () => {
    const providerSetup = setup({
      clientResult: {
        status: "failed",
        failureCode: "provider_timeout",
        latencyMs: 15_000,
      },
    });
    const providerResult = await providerSetup.service.generate(
      providerSetup.report,
    );
    expect(providerResult.explanation).toMatchObject({
      status: "failed",
      failureCode: "provider_timeout",
      metadata: {
        latencyMs: 15_000,
        validationStatus: "not_run",
        failureCode: "provider_timeout",
        deterministicFallback: true,
      },
    });
    expect(providerResult.explanation).not.toHaveProperty("explanation");
    expect(providerResult.result).toBe(providerSetup.report.result);
    expect(providerSetup.observability.recordFallback).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ failureCode: "provider_timeout" }),
    );

    const validationSetup = setup({
      validationResult: {
        status: "invalid",
        failureCode: "unknown_file_path",
      },
    });
    const validationResult = await validationSetup.service.generate(
      validationSetup.report,
    );
    expect(validationResult.explanation).toMatchObject({
      status: "failed",
      failureCode: "unknown_file_path",
      metadata: {
        validationStatus: "invalid",
        failureCode: "unknown_file_path",
        deterministicFallback: true,
      },
    });
    expect(validationResult.explanation).not.toHaveProperty("explanation");
    expect(validationSetup.client.generate).toHaveBeenCalledTimes(2);
  });

  it("repairs one unknown file-path failure and combines provider usage", async () => {
    const repairedExplanation = {
      ...explanation,
      answer: "The repaired grounded answer.",
    };
    const repairResult = {
      status: "completed",
      explanation: repairedExplanation,
      metadata: {
        provider: "openai",
        model: "configured-model",
        promptVersion: IMPACT_EXPLANATION_PROMPT_VERSION,
        outputSchemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
        latencyMs: 30,
        usage: {
          inputTokens: 120,
          outputTokens: 45,
          totalTokens: 165,
        },
      },
    };
    const repairSetup = setup({
      validationResult: {
        status: "invalid",
        failureCode: "unknown_file_path",
      },
      repairResult,
      repairValidationResult: {
        status: "valid",
        explanation: repairedExplanation,
      },
    });

    const result = await repairSetup.service.generate(repairSetup.report);

    expect(repairSetup.client.generate).toHaveBeenCalledTimes(2);
    expect(repairSetup.client.generate.mock.calls[1]).toEqual([
      packet,
      {
        repair: {
          candidate: explanation,
          failureCode: "unknown_file_path",
        },
      },
    ]);
    expect(result.explanation).toMatchObject({
      status: "completed",
      explanation: repairedExplanation,
      metadata: {
        latencyMs: 55,
        usage: {
          inputTokens: 220,
          outputTokens: 85,
          totalTokens: 305,
        },
      },
    });
  });

  it("short-circuits insufficient evidence before the provider", async () => {
    const { service, report: stored, client } = setup({
      packetResult: {
        status: "insufficient_evidence",
        reason: "no_resolved_evidence",
      },
    });

    const result = await service.generate(stored);

    expect(client.generate).not.toHaveBeenCalled();
    expect(result.explanation).toMatchObject({
      status: "failed",
      failureCode: "no_resolved_evidence",
      metadata: {
        evidencePacketHash: null,
        provider: null,
        model: null,
        failureCode: "no_resolved_evidence",
        deterministicFallback: true,
      },
    });
  });

  it("falls back when packet construction throws", async () => {
    const { service, report: stored, packets, client } = setup();
    packets.build.mockImplementation(() => {
      throw new Error("raw packet error");
    });

    const result = await service.generate(stored);

    expect(client.generate).not.toHaveBeenCalled();
    expect(result.explanation).toMatchObject({
      status: "failed",
      failureCode: "generation_failed",
      metadata: {
        provider: null,
        model: null,
        failureCode: "generation_failed",
        deterministicFallback: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("raw packet error");
  });
});
