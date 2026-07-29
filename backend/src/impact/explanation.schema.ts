import { z } from "zod";
import {
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
    claims: z.array(claimSchema),
    implementationSteps: z.array(implementationStepSchema),
    verificationSteps: z.array(verificationStepSchema),
    remainingQuestions: z.array(nonEmptyTextSchema),
  })
  .strict();

const stateBase = {
  schemaVersion: z.literal(IMPACT_EXPLANATION_SCHEMA_VERSION),
};

export const impactExplanationStateSchema: z.ZodType<ImpactExplanationState> =
  z.discriminatedUnion("status", [
    z.object({ ...stateBase, status: z.literal("pending") }).strict(),
    z
      .object({
        ...stateBase,
        status: z.literal("completed"),
        explanation: impactExplanationSchema,
      })
      .strict(),
    z.object({ ...stateBase, status: z.literal("failed") }).strict(),
    z.object({ ...stateBase, status: z.literal("disabled") }).strict(),
  ]);
