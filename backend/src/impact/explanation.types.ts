export const LEGACY_IMPACT_EXPLANATION_SCHEMA_VERSION = "1" as const;
export const IMPACT_EXPLANATION_SCHEMA_VERSION = "2" as const;

export type ImpactExplanationSchemaVersion =
  | typeof LEGACY_IMPACT_EXPLANATION_SCHEMA_VERSION
  | typeof IMPACT_EXPLANATION_SCHEMA_VERSION;

export interface LegacyImpactExplanation {
  schemaVersion: typeof LEGACY_IMPACT_EXPLANATION_SCHEMA_VERSION;
  executiveSummary: string;
  answer: string;
  claims: Array<{ text: string; evidenceIds: string[] }>;
  implementationSteps: Array<{
    title: string;
    detail: string;
    evidenceIds: string[];
  }>;
  verificationSteps: Array<{ text: string; evidenceIds: string[] }>;
  remainingQuestions: string[];
}

export type ImpactBriefingAudience =
  | "product"
  | "engineering"
  | "operations";

export interface ImpactBriefingPoint {
  text: string;
  evidenceIds: string[];
}

export interface ImpactBriefingPracticalImpact extends ImpactBriefingPoint {
  audience: ImpactBriefingAudience;
}

/** Concise generated prose kept separate from deterministic Atlas findings. */
export interface ImpactExplanation {
  schemaVersion: typeof IMPACT_EXPLANATION_SCHEMA_VERSION;
  bottomLine: ImpactBriefingPoint;
  practicalImpacts: ImpactBriefingPracticalImpact[];
  nextActions: ImpactBriefingPoint[];
  verificationChecks: ImpactBriefingPoint[];
  openQuestions: string[];
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
  "briefing_too_verbose",
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

type ExplanationLifecycleState =
  | {
      status: "pending";
      schemaVersion: ImpactExplanationSchemaVersion;
      evidencePacketHash?: string;
      promptVersion?: string;
      sourceRevision?: string;
      startedAt?: string;
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

export type ImpactExplanationState =
  | ExplanationLifecycleState
  | {
      status: "completed";
      schemaVersion: typeof IMPACT_EXPLANATION_SCHEMA_VERSION;
      explanation: ImpactExplanation;
      metadata?: ImpactExplanationGenerationMetadata;
    }
  | {
      status: "completed";
      schemaVersion: typeof LEGACY_IMPACT_EXPLANATION_SCHEMA_VERSION;
      explanation: LegacyImpactExplanation;
      metadata?: ImpactExplanationGenerationMetadata;
    };
