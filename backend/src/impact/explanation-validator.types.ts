import type {
  ImpactExplanation,
  ImpactExplanationFailureCode,
} from "./explanation.types";

export type ExplanationValidationFailureCode = Extract<
  ImpactExplanationFailureCode,
  | "invalid_explanation_schema"
  | "explanation_too_large"
  | "unknown_evidence_id"
  | "unknown_file_path"
  | "unknown_symbol"
  | "unsupported_relationship"
  | "altered_risk"
  | "altered_confidence"
  | "altered_provenance"
  | "missing_unknown_impact"
>;

export type ExplanationValidationResult =
  | {
      status: "valid";
      explanation: ImpactExplanation;
    }
  | {
      status: "invalid";
      failureCode: ExplanationValidationFailureCode;
    };
