export const IMPACT_EXPLANATION_SCHEMA_VERSION = "1" as const;

export type ImpactExplanationSchemaVersion =
  typeof IMPACT_EXPLANATION_SCHEMA_VERSION;

export interface ImpactExplanationClaim {
  text: string;
  evidenceIds: string[];
}

export interface ImpactExplanationImplementationStep {
  title: string;
  detail: string;
  evidenceIds: string[];
}

export interface ImpactExplanationVerificationStep {
  text: string;
  evidenceIds: string[];
}

/**
 * Generated prose is kept separate from the deterministic ImpactReportResult.
 * Claims describe observed facts; implementation and verification steps are
 * recommendations grounded in the cited evidence.
 */
export interface ImpactExplanation {
  schemaVersion: ImpactExplanationSchemaVersion;
  executiveSummary: string;
  answer: string;
  claims: ImpactExplanationClaim[];
  implementationSteps: ImpactExplanationImplementationStep[];
  verificationSteps: ImpactExplanationVerificationStep[];
  remainingQuestions: string[];
}

export const IMPACT_EXPLANATION_FAILURE_CODES = [
  "configuration_error",
  "provider_timeout",
  "provider_authentication",
  "provider_permission_denied",
  "provider_rate_limited",
  "provider_request_rejected",
  "provider_unavailable",
  "provider_refusal",
  "provider_incomplete",
  "invalid_provider_response",
  "provider_error",
  "invalid_explanation_schema",
  "explanation_too_large",
  "prompt_injection_content",
  "unknown_evidence_id",
  "unknown_file_path",
  "unknown_symbol",
  "excessive_overview_technical_names",
  "unsupported_relationship",
  "altered_risk",
  "altered_confidence",
  "altered_provenance",
  "missing_unknown_impact",
  "repository_mismatch",
  "no_resolved_evidence",
  "no_citable_evidence",
  "generation_failed",
] as const;

export type ImpactExplanationFailureCode =
  (typeof IMPACT_EXPLANATION_FAILURE_CODES)[number];

export interface ImpactExplanationGenerationMetadata {
  provider: "openai" | "groq" | null;
  model: string | null;
  promptVersion: string;
  outputSchemaVersion: ImpactExplanationSchemaVersion;
  evidencePacketHash: string | null;
  sourceRevision: string;
  generatedAt: string;
  latencyMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  attempts?: Array<{
    provider: "openai" | "groq";
    model: string;
    status: "completed" | "failed";
    failureCode: ImpactExplanationFailureCode | null;
    latencyMs: number;
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
  }>;
  validationStatus: "valid" | "invalid" | "not_run";
  failureCode: ImpactExplanationFailureCode | null;
  deterministicFallback: boolean;
}

export type ImpactExplanationState =
  | {
      status: "pending";
      schemaVersion: ImpactExplanationSchemaVersion;
      evidencePacketHash?: string;
      promptVersion?: string;
      sourceRevision?: string;
      startedAt?: string;
    }
  | {
      status: "completed";
      schemaVersion: ImpactExplanationSchemaVersion;
      explanation: ImpactExplanation;
      metadata?: ImpactExplanationGenerationMetadata;
    }
  | {
      status: "failed";
      schemaVersion: ImpactExplanationSchemaVersion;
      failureCode?: ImpactExplanationFailureCode;
      metadata?: ImpactExplanationGenerationMetadata;
    }
  | {
      status: "disabled";
      schemaVersion: ImpactExplanationSchemaVersion;
    };
