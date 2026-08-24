import { z } from "zod";
import {
  IMPACT_EXPLANATION_FAILURE_CODES,
  IMPACT_EXPLANATION_SCHEMA_VERSION,
  LEGACY_IMPACT_EXPLANATION_SCHEMA_VERSION,
  type ImpactExplanation,
  type ImpactExplanationState,
  type LegacyImpactExplanation,
} from "./explanation.types";

const nonEmptyTextSchema = z.string().trim().min(1);
const evidenceIdsSchema = z.array(nonEmptyTextSchema).min(1);
const briefingPointSchema = z
  .object({ text: nonEmptyTextSchema, evidenceIds: evidenceIdsSchema })
  .strict();

export const impactExplanationSchema: z.ZodType<ImpactExplanation> = z
  .object({
    schemaVersion: z.literal(IMPACT_EXPLANATION_SCHEMA_VERSION),
    bottomLine: briefingPointSchema,
    practicalImpacts: z
      .array(
        briefingPointSchema.extend({
          audience: z.enum(["product", "engineering", "operations"]),
        }),
      )
      .min(1)
      .max(3),
    nextActions: z.array(briefingPointSchema).min(1).max(3),
    verificationChecks: z.array(briefingPointSchema).min(1).max(2),
    openQuestions: z.array(nonEmptyTextSchema).max(2),
  })
  .strict();

const legacyImpactExplanationSchema: z.ZodType<LegacyImpactExplanation> = z
  .object({
    schemaVersion: z.literal(LEGACY_IMPACT_EXPLANATION_SCHEMA_VERSION),
    executiveSummary: nonEmptyTextSchema,
    answer: nonEmptyTextSchema,
    claims: z.array(
      z.object({ text: nonEmptyTextSchema, evidenceIds: evidenceIdsSchema }).strict(),
    ),
    implementationSteps: z.array(
      z
        .object({
          title: nonEmptyTextSchema,
          detail: nonEmptyTextSchema,
          evidenceIds: evidenceIdsSchema,
        })
        .strict(),
    ),
    verificationSteps: z.array(
      z.object({ text: nonEmptyTextSchema, evidenceIds: evidenceIdsSchema }).strict(),
    ),
    remainingQuestions: z.array(nonEmptyTextSchema),
  })
  .strict();

export function impactExplanationProviderSchema(
  _evidenceIds: string[],
  requireOpenQuestion = false,
): z.ZodType<ImpactExplanation> {
  const providerText = z.string();
  const providerIds = z.array(providerText).min(1);
  const providerPoint = z
    .object({ text: providerText, evidenceIds: providerIds })
    .strict();
  return z
    .object({
      schemaVersion: z.literal(IMPACT_EXPLANATION_SCHEMA_VERSION),
      bottomLine: providerPoint,
      practicalImpacts: z
        .array(
          providerPoint.extend({
            audience: z.enum(["product", "engineering", "operations"]),
          }),
        )
        .min(1)
        .max(3),
      nextActions: z.array(providerPoint).min(1).max(3),
      verificationChecks: z.array(providerPoint).min(1).max(2),
      openQuestions: requireOpenQuestion
        ? z.array(providerText).min(1).max(2)
        : z.array(providerText).max(2),
    })
    .strict();
}

const schemaVersionSchema = z.enum([
  LEGACY_IMPACT_EXPLANATION_SCHEMA_VERSION,
  IMPACT_EXPLANATION_SCHEMA_VERSION,
]);
const stateBase = { schemaVersion: schemaVersionSchema };
const generationMetadataSchema = z
  .object({
    provider: z.enum(["openai", "groq"]).nullable(),
    model: z.string().nullable(),
    promptVersion: z.string().min(1),
    outputSchemaVersion: schemaVersionSchema,
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
            failureCode: z.enum(IMPACT_EXPLANATION_FAILURE_CODES).nullable(),
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
  z.union([
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
        status: z.literal("completed"),
        schemaVersion: z.literal(IMPACT_EXPLANATION_SCHEMA_VERSION),
        explanation: impactExplanationSchema,
        metadata: generationMetadataSchema.optional(),
      })
      .strict(),
    z
      .object({
        status: z.literal("completed"),
        schemaVersion: z.literal(LEGACY_IMPACT_EXPLANATION_SCHEMA_VERSION),
        explanation: legacyImpactExplanationSchema,
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
