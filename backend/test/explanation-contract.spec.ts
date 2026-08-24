import { describe, expect, it } from "vitest";
import {
  impactExplanationProviderSchema,
  impactExplanationSchema,
  impactExplanationStateSchema,
} from "../src/impact/explanation.schema";
import {
  IMPACT_EXPLANATION_SCHEMA_VERSION,
  LEGACY_IMPACT_EXPLANATION_SCHEMA_VERSION,
} from "../src/impact/explanation.types";

const validExplanation = {
  schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
  bottomLine: {
    text: "Update the resolved session validator while preserving its observed consumer.",
    evidenceIds: ["relationship:456"],
  },
  practicalImpacts: [
    {
      audience: "engineering" as const,
      text: "The application layout depends on the current validation contract.",
      evidenceIds: ["relationship:456"],
    },
  ],
  nextActions: [
    {
      text: "Preserve the validator contract while updating its behavior.",
      evidenceIds: ["chunk:123", "relationship:456"],
    },
  ],
  verificationChecks: [
    {
      text: "Exercise the observed layout consumer before merge.",
      evidenceIds: ["relationship:456"],
    },
  ],
  openQuestions: ["Do runtime-only consumers require coordination?"],
};

describe("impact explanation contract", () => {
  it("accepts a versioned, cited practical briefing", () => {
    expect(impactExplanationSchema.parse(validExplanation)).toEqual(validExplanation);
  });

  it("requires citations on every generated briefing point", () => {
    expect(
      impactExplanationSchema.safeParse({
        ...validExplanation,
        practicalImpacts: [{ ...validExplanation.practicalImpacts[0], evidenceIds: [] }],
      }).success,
    ).toBe(false);
  });

  it("enforces audience and list limits in provider output", () => {
    const providerSchema = impactExplanationProviderSchema(["relationship:456"]);
    expect(providerSchema.safeParse(validExplanation).success).toBe(true);
    expect(
      providerSchema.safeParse({
        ...validExplanation,
        practicalImpacts: [{ ...validExplanation.practicalImpacts[0], audience: "security" }],
      }).success,
    ).toBe(false);
    expect(
      providerSchema.safeParse({
        ...validExplanation,
        verificationChecks: [...validExplanation.verificationChecks, ...validExplanation.verificationChecks],
      }).success,
    ).toBe(true);
    expect(
      providerSchema.safeParse({
        ...validExplanation,
        verificationChecks: Array.from({ length: 3 }, () => validExplanation.verificationChecks[0]),
      }).success,
    ).toBe(false);
  });

  it("requires an open question when packet context has gaps", () => {
    const providerSchema = impactExplanationProviderSchema(["relationship:456"], true);
    expect(providerSchema.safeParse({ ...validExplanation, openQuestions: [] }).success).toBe(false);
    expect(providerSchema.safeParse(validExplanation).success).toBe(true);
  });

  it.each(["pending", "failed", "disabled"] as const)(
    "accepts the %s lifecycle state",
    (status) => {
      expect(
        impactExplanationStateSchema.parse({
          status,
          schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
        }),
      ).toEqual({ status, schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION });
    },
  );

  it("keeps stored v1 explanations readable", () => {
    const legacy = {
      schemaVersion: LEGACY_IMPACT_EXPLANATION_SCHEMA_VERSION,
      executiveSummary: "A legacy summary.",
      answer: "A legacy answer.",
      claims: [{ text: "A legacy claim.", evidenceIds: ["relationship:456"] }],
      implementationSteps: [{ title: "Act", detail: "Preserve the contract.", evidenceIds: ["relationship:456"] }],
      verificationSteps: [{ text: "Verify it.", evidenceIds: ["relationship:456"] }],
      remainingQuestions: [],
    };
    expect(
      impactExplanationStateSchema.safeParse({
        status: "completed",
        schemaVersion: LEGACY_IMPACT_EXPLANATION_SCHEMA_VERSION,
        explanation: legacy,
      }).success,
    ).toBe(true);
  });

  it("rejects unknown fields and obsolete provider versions", () => {
    expect(impactExplanationSchema.safeParse({ ...validExplanation, risk: { level: "low" } }).success).toBe(false);
    expect(impactExplanationProviderSchema([]).safeParse({ ...validExplanation, schemaVersion: "1" }).success).toBe(false);
  });
});
