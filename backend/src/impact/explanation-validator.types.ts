import type {
  ImpactExplanation,
  ImpactExplanationFailureCode,
} from "./explanation.types";

export type ExplanationValidationFailureCode = Extract<
  ImpactExplanationFailureCode,
  | "invalid_explanation_schema"
  | "explanation_too_large"
  | "briefing_too_verbose"
  | "prompt_injection_content"
  | "unknown_evidence_id"
  | "unknown_file_path"
  | "unknown_symbol"
  | "excessive_overview_technical_names"
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
