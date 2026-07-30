import { describe, expect, it } from "vitest";
import {
  impactExplanationProviderSchema,
  impactExplanationSchema,
  impactExplanationStateSchema,
} from "../src/impact/explanation.schema";
import { IMPACT_EXPLANATION_SCHEMA_VERSION } from "../src/impact/explanation.types";

const validExplanation = {
  schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
  executiveSummary: "The indexed authentication boundary is affected.",
  answer: "Update the resolved session validator and its observed consumer.",
  claims: [
    {
      text: "The layout imports the session validator.",
      evidenceIds: ["relationship:456"],
    },
  ],
  implementationSteps: [
    {
      title: "Preserve the validator contract",
      detail: "Update the resolved validator before its observed consumer.",
      evidenceIds: ["chunk:123", "relationship:456"],
    },
  ],
  verificationSteps: [
    {
      text: "Exercise the observed layout consumer.",
      evidenceIds: ["relationship:456"],
    },
  ],
  remainingQuestions: ["Runtime-only consumers remain unverified."],
};
const providerExplanation = {
  ...validExplanation,
  claims: Array.from({ length: 3 }, (_, index) => ({
    text: `The layout imports the session validator (${index + 1}).`,
    evidenceIds: ["relationship:456"],
  })),
  implementationSteps: Array.from({ length: 3 }, (_, index) => ({
    title: `Preserve the validator contract ${index + 1}`,
    detail: "Update the resolved validator before its observed consumer.",
    evidenceIds: ["relationship:456"],
  })),
  verificationSteps: Array.from({ length: 3 }, (_, index) => ({
    text: `Exercise the observed layout consumer (${index + 1}).`,
    evidenceIds: ["relationship:456"],
  })),
};

describe("impact explanation contract", () => {
  it("accepts a versioned, cited structured explanation", () => {
    expect(impactExplanationSchema.parse(validExplanation)).toEqual(
      validExplanation,
    );
  });

  it("requires citations on factual claims", () => {
    const result = impactExplanationSchema.safeParse({
      ...validExplanation,
      claims: [{ text: "An uncited factual claim.", evidenceIds: [] }],
    });

    expect(result.success).toBe(false);
  });

  it("keeps provider citations structured for canonical validation", () => {
    const providerSchema = impactExplanationProviderSchema([
      "relationship:456",
    ]);

    expect(
      providerSchema.safeParse({
        ...providerExplanation,
      }).success,
    ).toBe(true);
    expect(
      providerSchema.safeParse({
        ...providerExplanation,
        claims: [{ text: "Missing citation.", evidenceIds: [] }],
      }).success,
    ).toBe(false);
    expect(
      impactExplanationSchema.safeParse({
        ...providerExplanation,
        claims: [{ text: "Missing citation.", evidenceIds: [] }],
      }).success,
    ).toBe(false);
  });

  it("lets the grounding validator enforce remaining questions from packet context", () => {
    const providerSchema = impactExplanationProviderSchema(
      ["relationship:456", "chunk:123"],
      true,
    );

    expect(
      providerSchema.safeParse({
        ...providerExplanation,
        remainingQuestions: [],
      }).success,
    ).toBe(true);
    expect(providerSchema.safeParse(providerExplanation).success).toBe(true);
  });

  it("keeps recommendations structured and cited", () => {
    const result = impactExplanationSchema.safeParse({
      ...validExplanation,
      implementationSteps: [
        {
          title: "Uncited recommendation",
          detail: "A recommendation cannot masquerade as observed evidence.",
          evidenceIds: [],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it.each(["pending", "failed", "disabled"] as const)(
    "accepts the %s lifecycle state",
    (status) => {
      expect(
        impactExplanationStateSchema.parse({
          status,
          schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
        }),
      ).toEqual({
        status,
        schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
      });
    },
  );

  it("requires structured output for the completed state", () => {
    expect(
      impactExplanationStateSchema.parse({
        status: "completed",
        schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
        explanation: validExplanation,
      }),
    ).toMatchObject({ status: "completed", explanation: validExplanation });

    expect(
      impactExplanationStateSchema.safeParse({
        status: "completed",
        schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
        explanation: "Unrestricted Markdown",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields and output schema versions", () => {
    expect(
      impactExplanationSchema.safeParse({
        ...validExplanation,
        schemaVersion: "2",
      }).success,
    ).toBe(false);

    expect(
      impactExplanationSchema.safeParse({
        ...validExplanation,
        risk: { level: "low", score: 1 },
      }).success,
    ).toBe(false);
  });
});
