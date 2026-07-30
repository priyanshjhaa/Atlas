import { describe, expect, it } from "vitest";
import { zodResponseFormat } from "openai/helpers/zod";
import {
  impactExplanationProviderSchema,
  impactExplanationSchema,
} from "../src/impact/explanation.schema";
import { IMPACT_EXPLANATION_SCHEMA_VERSION } from "../src/impact/explanation.types";

const stepEvidence = ["E1"];
const legacyExplanation = {
  schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
  answer: "A grounded answer.",
  executiveSummary: "A grounded summary.",
  claims: [{ text: "A grounded claim.", evidenceIds: stepEvidence }],
  implementationSteps: [
    {
      title: "Update the boundary",
      detail: "Preserve the contract.",
      evidenceIds: stepEvidence,
    },
  ],
  verificationSteps: [
    { text: "Verify the boundary.", evidenceIds: stepEvidence },
  ],
  remainingQuestions: [],
};

describe("impact explanation schemas", () => {
  it("keeps legacy stored explanations readable", () => {
    expect(impactExplanationSchema.safeParse(legacyExplanation).success).toBe(
      true,
    );
  });

  it("keeps the provider schema simple for Groq structured output", () => {
    const providerSchema = impactExplanationProviderSchema(["E1"]);
    expect(providerSchema.safeParse(legacyExplanation).success).toBe(true);

    expect(
      providerSchema.safeParse({
        ...legacyExplanation,
        claims: Array.from({ length: 3 }, (_, index) => ({
          text: `Grounded claim ${index + 1}.`,
          evidenceIds: stepEvidence,
        })),
        implementationSteps: Array.from({ length: 3 }, (_, index) => ({
          title: `Implementation step ${index + 1}`,
          detail: "Preserve the observed contract.",
          evidenceIds: stepEvidence,
        })),
        verificationSteps: Array.from({ length: 3 }, (_, index) => ({
          text: `Verification step ${index + 1}.`,
          evidenceIds: stepEvidence,
        })),
      }).success,
    ).toBe(true);
  });

  it("uses only structural constraints in Groq strict mode", () => {
    const responseFormat = zodResponseFormat(
      impactExplanationProviderSchema(["E1"], true),
      "atlas_impact_explanation_v1",
    );
    const serialized = JSON.stringify(responseFormat);

    expect(responseFormat.json_schema.strict).toBe(true);
    expect(serialized).not.toContain('"const"');
    expect(serialized).not.toContain('"minLength"');
    expect(serialized).toContain('"minItems":1');
  });
});
