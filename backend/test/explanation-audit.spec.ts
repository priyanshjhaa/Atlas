import { describe, expect, it } from "vitest";
import { explanationAuditEvent } from "../src/impact/explanation-audit";
import {
  IMPACT_EXPLANATION_SCHEMA_VERSION,
  type ImpactExplanationState,
} from "../src/impact/explanation.types";

const metadata = {
  provider: "openai" as const,
  model: "gpt-test",
  promptVersion: "impact-explanation-v1",
  outputSchemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
  evidencePacketHash: "packet-hash",
  sourceRevision: "revision-1",
  generatedAt: "2026-07-29T00:00:00.000Z",
  latencyMs: 42,
  usage: { inputTokens: 100, outputTokens: 25, totalTokens: 125 },
  validationStatus: "valid" as const,
  failureCode: null,
  deterministicFallback: false,
};

describe("explanationAuditEvent", () => {
  it("does not audit transient pending state", () => {
    expect(
      explanationAuditEvent({
        status: "pending",
        schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
      }),
    ).toBeNull();
  });

  it("records reproducibility metadata without generated prose", () => {
    const state: ImpactExplanationState = {
      status: "completed",
      schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
      explanation: {
        schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
        bottomLine: { text: "secret generated bottom line", evidenceIds: ["chunk:1"] },
        practicalImpacts: [{ audience: "engineering", text: "secret impact", evidenceIds: ["chunk:1"] }],
        nextActions: [{ text: "secret action", evidenceIds: ["chunk:1"] }],
        verificationChecks: [{ text: "secret check", evidenceIds: ["chunk:1"] }],
        openQuestions: [],
      },
      metadata,
    };

    const audit = explanationAuditEvent(state);

    expect(audit).toMatchObject({
      action: "impact.explanation.completed",
      metadata: {
        provider: "openai",
        model: "gpt-test",
        promptVersion: "impact-explanation-v1",
        evidencePacketHash: "packet-hash",
        sourceRevision: "revision-1",
        failureCode: null,
        deterministicFallback: false,
      },
    });
    expect(JSON.stringify(audit)).not.toContain("secret");
  });

  it("records fallback failure codes", () => {
    const audit = explanationAuditEvent({
      status: "failed",
      schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
      failureCode: "unknown_file_path",
      metadata: {
        ...metadata,
        validationStatus: "invalid",
        failureCode: "unknown_file_path",
        deterministicFallback: true,
      },
    });

    expect(audit).toMatchObject({
      action: "impact.explanation.fallback",
      metadata: {
        failureCode: "unknown_file_path",
        validationStatus: "invalid",
        deterministicFallback: true,
      },
    });
  });
});
