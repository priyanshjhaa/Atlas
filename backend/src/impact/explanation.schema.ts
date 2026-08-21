import { z } from "zod";
import {
  IMPACT_EXPLANATION_FAILURE_CODES,
  IMPACT_EXPLANATION_SCHEMA_VERSION,
  type ImpactExplanation,
  type ImpactExplanationState,
} from "./explanation.types";

const nonEmptyTextSchema = z.string().trim().min(1);
const evidenceIdsSchema = z.array(nonEmptyTextSchema).min(1);

function buildImpactExplanationSchema(
  evidenceIdSchema: z.ZodType<string>,
  requireRemainingQuestions = false,
): z.ZodType<ImpactExplanation> {
  const citedEvidenceIdsSchema = z.array(evidenceIdSchema).min(1);
  const claimsSchema = z.array(
    z
      .object({
        text: nonEmptyTextSchema,
        evidenceIds: citedEvidenceIdsSchema,
      })
      .strict(),
  );
  const implementationStepsSchema = z.array(
    z
      .object({
        title: nonEmptyTextSchema,
        detail: nonEmptyTextSchema,
        evidenceIds: citedEvidenceIdsSchema,
      })
      .strict(),
  );
  const verificationStepsSchema = z.array(
    z
      .object({
        text: nonEmptyTextSchema,
        evidenceIds: citedEvidenceIdsSchema,
      })
      .strict(),
  );
  return z
    .object({
      schemaVersion: z.literal(IMPACT_EXPLANATION_SCHEMA_VERSION),
      executiveSummary: nonEmptyTextSchema,
      answer: nonEmptyTextSchema,
      claims: claimsSchema.min(1),
      implementationSteps: implementationStepsSchema,
      verificationSteps: verificationStepsSchema,
      remainingQuestions: requireRemainingQuestions
        ? z.array(nonEmptyTextSchema).min(1)
        : z.array(nonEmptyTextSchema),
    })
    .strict();
}

export const impactExplanationSchema = buildImpactExplanationSchema(
  evidenceIdsSchema.element,
);

export function impactExplanationProviderSchema(
  _evidenceIds: string[],
  requireRemainingQuestions = false,
): z.ZodType<ImpactExplanation> {
  const providerTextSchema = z.string();
  const providerEvidenceIdsSchema = z.array(providerTextSchema).min(1);

  return z
    .object({
      schemaVersion: z.enum([IMPACT_EXPLANATION_SCHEMA_VERSION]),
      executiveSummary: providerTextSchema,
      answer: providerTextSchema,
      claims: z
        .array(
          z
            .object({
              text: providerTextSchema,
              evidenceIds: providerEvidenceIdsSchema,
            })
            .strict(),
        )
        .min(2)
        .max(4),
      implementationSteps: z
        .array(
          z
            .object({
              title: providerTextSchema,
              detail: providerTextSchema,
              evidenceIds: providerEvidenceIdsSchema,
            })
            .strict(),
        )
        .min(2)
        .max(4),
      verificationSteps: z
        .array(
          z
            .object({
              text: providerTextSchema,
              evidenceIds: providerEvidenceIdsSchema,
            })
            .strict(),
        )
        .min(2)
        .max(3),
      remainingQuestions: requireRemainingQuestions
        ? z.array(providerTextSchema).min(1)
        : z.array(providerTextSchema),
    })
    .strict();
}

const stateBase = {
  schemaVersion: z.literal(IMPACT_EXPLANATION_SCHEMA_VERSION),
};

const generationMetadataSchema = z
  .object({
    provider: z.enum(["openai", "groq"]).nullable(),
    model: z.string().nullable(),
    promptVersion: z.string().min(1),
    outputSchemaVersion: z.literal(IMPACT_EXPLANATION_SCHEMA_VERSION),
    evidencePacketHash: z.string().nullable(),
    sourceRevision: z.string().min(1),
    generatedAt: z.string().min(1),
    latencyMs: z.number().nonnegative(),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        totalTokens: z.number().int().nonnegative(),
      })
      .strict(),
    attempts: z
      .array(
        z
          .object({
            provider: z.enum(["openai", "groq"]),
            model: z.string().min(1),
            status: z.enum(["completed", "failed"]),
            failureCode: z
              .enum(IMPACT_EXPLANATION_FAILURE_CODES)
              .nullable(),
            latencyMs: z.number().nonnegative(),
            usage: z
              .object({
                inputTokens: z.number().int().nonnegative(),
                outputTokens: z.number().int().nonnegative(),
                totalTokens: z.number().int().nonnegative(),
              })
              .strict(),
          })
          .strict(),
      )
      .optional(),
    validationStatus: z.enum(["valid", "invalid", "not_run"]),
    failureCode: z.enum(IMPACT_EXPLANATION_FAILURE_CODES).nullable(),
    deterministicFallback: z.boolean(),
  })
  .strict();

export const impactExplanationStateSchema: z.ZodType<ImpactExplanationState> =
  z.discriminatedUnion("status", [
    z
      .object({
        ...stateBase,
        status: z.literal("pending"),
        evidencePacketHash: z.string().optional(),
        promptVersion: z.string().optional(),
        sourceRevision: z.string().optional(),
        startedAt: z.string().optional(),
      })
      .strict(),
    z
      .object({
        ...stateBase,
        status: z.literal("completed"),
        explanation: impactExplanationSchema,
        metadata: generationMetadataSchema.optional(),
      })
      .strict(),
    z
      .object({
        ...stateBase,
        status: z.literal("failed"),
        failureCode: z.enum(IMPACT_EXPLANATION_FAILURE_CODES).optional(),
        metadata: generationMetadataSchema.optional(),
      })
      .strict(),
    z.object({ ...stateBase, status: z.literal("disabled") }).strict(),
  ]);
