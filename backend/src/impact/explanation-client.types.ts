import type { ImpactEvidencePacket } from "./evidence-packet.types";
import type {
  ImpactExplanation,
  ImpactExplanationSchemaVersion,
} from "./explanation.types";

export type ExplanationProvider = "openai";

export type ExplanationFailureCode =
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
  | "provider_error";

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

export interface ExplanationClient {
  generate(packet: ImpactEvidencePacket): Promise<ExplanationGenerationResult>;
}
