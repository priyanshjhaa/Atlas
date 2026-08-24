import { describe, expect, it } from "vitest";
import { zodResponseFormat } from "openai/helpers/zod";
import { impactExplanationProviderSchema } from "../src/impact/explanation.schema";
import { IMPACT_EXPLANATION_SCHEMA_VERSION } from "../src/impact/explanation.types";

const explanation = {
  schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
  bottomLine: { text: "A grounded bottom line.", evidenceIds: ["E1"] },
  practicalImpacts: [
    { audience: "engineering" as const, text: "A grounded impact.", evidenceIds: ["E1"] },
  ],
  nextActions: [{ text: "Preserve the observed contract.", evidenceIds: ["E1"] }],
  verificationChecks: [{ text: "Verify the boundary.", evidenceIds: ["E1"] }],
  openQuestions: [],
};

describe("impact explanation schemas", () => {
  it("keeps the provider schema simple for Groq structured output", () => {
    expect(impactExplanationProviderSchema(["E1"]).safeParse(explanation).success).toBe(true);
  });

  it("uses only structural constraints in Groq strict mode", () => {
    const responseFormat = zodResponseFormat(
      impactExplanationProviderSchema(["E1"], true),
      "atlas_impact_briefing_v2",
    );
    const serialized = JSON.stringify(responseFormat);

    expect(responseFormat.json_schema.strict).toBe(true);
    expect(serialized).not.toContain('"minLength"');
    expect(serialized).toContain('"minItems":1');
    expect(serialized).toContain('"maxItems":3');
    expect(serialized).toContain('"maxItems":2');
  });
});
