import { z } from "zod";
import {
  IMPACT_EXPLANATION_FAILURE_CODES,
  IMPACT_EXPLANATION_SCHEMA_VERSION,
  type ImpactExplanation,
  type ImpactExplanationState,
} from "./explanation.types";

const nonEmptyTextSchema = z.string().trim().min(1);
const evidenceIdsSchema = z.array(nonEmptyTextSchema).min(1);

const claimSchema = z
  .object({
    text: nonEmptyTextSchema,
    evidenceIds: evidenceIdsSchema,
  })
  .strict();

const implementationStepSchema = z
  .object({
    title: nonEmptyTextSchema,
    detail: nonEmptyTextSchema,
    evidenceIds: evidenceIdsSchema,
  })
  .strict();

const verificationStepSchema = z
  .object({
    text: nonEmptyTextSchema,
    evidenceIds: evidenceIdsSchema,
  })
  .strict();

export const impactExplanationSchema: z.ZodType<ImpactExplanation> = z
  .object({
    schemaVersion: z.literal(IMPACT_EXPLANATION_SCHEMA_VERSION),
    executiveSummary: nonEmptyTextSchema,
    answer: nonEmptyTextSchema,
    claims: z.array(claimSchema).min(1),
    implementationSteps: z.array(implementationStepSchema),
    verificationSteps: z.array(verificationStepSchema),
    remainingQuestions: z.array(nonEmptyTextSchema),
  })
  .strict();

const stateBase = {
  schemaVersion: z.literal(IMPACT_EXPLANATION_SCHEMA_VERSION),
};

const generationMetadataSchema = z
  .object({
    provider: z.literal("openai").nullable(),
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
    validationStatus: z.enum(["valid", "invalid", "not_run"]),
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
