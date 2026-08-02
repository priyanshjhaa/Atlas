import type { ImpactEvidencePacket } from "./evidence-packet.types";
import type {
  ImpactExplanation,
  ImpactExplanationFailureCode,
  ImpactExplanationSchemaVersion,
} from "./explanation.types";
import type { ExplanationValidationFailureCode } from "./explanation-validator.types";

export type ExplanationProvider = "openai" | "groq";

export type ExplanationFailureCode = Extract<
  ImpactExplanationFailureCode,
  | "configuration_error"
  | "provider_timeout"
  | "provider_authentication"
  | "provider_permission_denied"
  | "provider_rate_limited"
  | "provider_request_rejected"
  | "provider_unavailable"
  | "provider_refusal"
  | "provider_incomplete"
  | "invalid_provider_response"
  | "provider_error"
>;

export interface ExplanationGenerationMetadata {
  provider: ExplanationProvider;
  model: string;
  promptVersion: string;
  outputSchemaVersion: ImpactExplanationSchemaVersion;
  latencyMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export type ExplanationGenerationResult =
  | {
      status: "completed";
      explanation: ImpactExplanation;
      metadata: ExplanationGenerationMetadata;
    }
  | {
      status: "failed";
      failureCode: ExplanationFailureCode;
      latencyMs: number;
    }
  | {
      status: "disabled";
    };

export interface ExplanationGenerationOptions {
  repair?: {
    candidate: ImpactExplanation;
    failureCode: ExplanationValidationFailureCode;
  };
}

export interface ExplanationClient {
  generate(
    packet: ImpactEvidencePacket,
    options?: ExplanationGenerationOptions,
  ): Promise<ExplanationGenerationResult>;
}
