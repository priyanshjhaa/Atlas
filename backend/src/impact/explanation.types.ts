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

export type ImpactExplanationState =
  | {
      status: "pending";
      schemaVersion: ImpactExplanationSchemaVersion;
    }
  | {
      status: "completed";
      schemaVersion: ImpactExplanationSchemaVersion;
      explanation: ImpactExplanation;
    }
  | {
      status: "failed";
      schemaVersion: ImpactExplanationSchemaVersion;
    }
  | {
      status: "disabled";
      schemaVersion: ImpactExplanationSchemaVersion;
    };
