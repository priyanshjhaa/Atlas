import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExplanationObservabilityService } from "../src/impact/explanation-observability.service";
import {
  IMPACT_EXPLANATION_SCHEMA_VERSION,
  type ImpactExplanationGenerationMetadata,
} from "../src/impact/explanation.types";

const report = {
  id: "report-1",
  workspaceId: "workspace-1",
  repositoryId: "repository-1",
  sourceRevision: "revision-1",
};

function metadata(
  failureCode: ImpactExplanationGenerationMetadata["failureCode"] = null,
): ImpactExplanationGenerationMetadata {
  return {
    provider: "openai",
    model: "gpt-test",
    promptVersion: "impact-explanation-v1",
    outputSchemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
    evidencePacketHash: "packet-hash",
    sourceRevision: "revision-1",
    generatedAt: "2026-07-29T00:00:00.000Z",
    latencyMs: 42,
    usage: { inputTokens: 100, outputTokens: 25, totalTokens: 125 },
    validationStatus: failureCode ? "invalid" : "valid",
    failureCode,
    deterministicFallback: Boolean(failureCode),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ExplanationObservabilityService", () => {
  it("tracks successful and fallback outcomes by safe dimensions", () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const service = new ExplanationObservabilityService();

    service.recordAttempt(report, "packet-hash");
    service.recordSuccess(report, metadata());
    service.recordFallback(report, metadata("unknown_file_path"));

    expect(service.snapshot()).toEqual({
      attempts: 1,
      successes: 1,
      fallbacks: 1,
      disabled: 0,
      totalLatencyMs: 84,
      inputTokens: 200,
      outputTokens: 50,
      fallbacksByCode: { unknown_file_path: 1 },
    });
  });

  it("does not place prompts, source excerpts, or generated prose in logs", () => {
    const log = vi
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const service = new ExplanationObservabilityService();

    service.recordSuccess(report, metadata());
    service.recordFallback(report, metadata("provider_timeout"));

    const serialized = JSON.stringify([
      ...log.mock.calls,
      ...warn.mock.calls,
    ]);
    expect(serialized).not.toContain("prompt text");
    expect(serialized).not.toContain("source excerpt");
    expect(serialized).not.toContain("generated answer");
    expect(serialized).toContain("packet-hash");
    expect(serialized).toContain("provider_timeout");
  });
});
