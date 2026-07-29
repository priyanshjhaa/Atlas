import { Inject, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from "openai";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { Environment } from "../config/environment";
import type { ImpactEvidencePacket } from "./evidence-packet.types";
import type {
  ExplanationClient,
  ExplanationFailureCode,
  ExplanationGenerationResult,
} from "./explanation-client.types";
import {
  IMPACT_EXPLANATION_PROMPT_VERSION,
  IMPACT_EXPLANATION_SYSTEM_PROMPT,
} from "./explanation.prompt";
import { impactExplanationSchema } from "./explanation.schema";
import { IMPACT_EXPLANATION_SCHEMA_VERSION } from "./explanation.types";

export const OPENAI_EXPLANATION_CLIENT = Symbol(
  "OPENAI_EXPLANATION_CLIENT",
);

@Injectable()
export class OpenAIExplanationClient implements ExplanationClient {
  private client?: OpenAI;

  constructor(
    private readonly config: ConfigService<Environment, true>,
    @Optional()
    @Inject(OPENAI_EXPLANATION_CLIENT)
    private readonly providedClient?: OpenAI,
  ) {}

  async generate(
    packet: ImpactEvidencePacket,
  ): Promise<ExplanationGenerationResult> {
    if (!this.config.get("LLM_EXPLANATIONS_ENABLED", { infer: true })) {
      return { status: "disabled" };
    }

    const model = this.config.get("LLM_EXPLANATION_MODEL", { infer: true });
    const apiKey = this.config.get("OPENAI_API_KEY", { infer: true });
    if (!model || !apiKey) {
      return {
        status: "failed",
        failureCode: "configuration_error",
        latencyMs: 0,
      };
    }

    const timeout = this.config.get("LLM_EXPLANATION_TIMEOUT_MS", {
      infer: true,
    });
    const startedAt = performance.now();

    try {
      const response = await this.openai(apiKey, timeout).responses.parse(
        {
          model,
          instructions: IMPACT_EXPLANATION_SYSTEM_PROMPT,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: this.packetInput(packet),
                },
              ],
            },
          ],
          text: {
            format: zodTextFormat(
              impactExplanationSchema,
              "atlas_impact_explanation_v1",
            ),
          },
          tools: [],
          store: false,
        },
        {
          maxRetries: 0,
          timeout,
          signal: AbortSignal.timeout(timeout),
        },
      );
      const latencyMs = this.elapsedMilliseconds(startedAt);

      if (!response.output_parsed) {
        return {
          status: "failed",
          failureCode: this.responseFailureCode(response),
          latencyMs,
        };
      }

      return {
        status: "completed",
        explanation: response.output_parsed,
        metadata: {
          provider: "openai",
          model,
          promptVersion: IMPACT_EXPLANATION_PROMPT_VERSION,
          outputSchemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
          latencyMs,
          usage: {
            inputTokens: response.usage?.input_tokens ?? 0,
            outputTokens: response.usage?.output_tokens ?? 0,
            totalTokens: response.usage?.total_tokens ?? 0,
          },
        },
      };
    } catch (error: unknown) {
      return {
        status: "failed",
        failureCode: this.normalizeError(error),
        latencyMs: this.elapsedMilliseconds(startedAt),
      };
    }
  }

  private openai(apiKey: string, timeout: number): OpenAI {
    if (this.providedClient) return this.providedClient;
    this.client ??= new OpenAI({
      apiKey,
      maxRetries: 0,
      timeout,
    });
    return this.client;
  }

  private packetInput(packet: ImpactEvidencePacket): string {
    return [
      "The following JSON is the complete authorized evidence packet.",
      "BEGIN_ATLAS_EVIDENCE_PACKET",
      JSON.stringify(packet),
      "END_ATLAS_EVIDENCE_PACKET",
    ].join("\n");
  }

  private responseFailureCode(response: {
    status?: string | null;
    output: Array<{
      type: string;
      content?: Array<{ type: string }>;
    }>;
  }): ExplanationFailureCode {
    const refused = response.output.some(
      (item) =>
        item.type === "message" &&
        item.content?.some((content) => content.type === "refusal"),
    );
    if (refused) return "provider_refusal";
    if (response.status === "incomplete") return "provider_incomplete";
    return "invalid_provider_response";
  }

  private normalizeError(error: unknown): ExplanationFailureCode {
    if (
      error instanceof APIConnectionTimeoutError ||
      error instanceof APIUserAbortError
    ) {
      return "provider_timeout";
    }
    if (error instanceof AuthenticationError) {
      return "provider_authentication";
    }
    if (error instanceof PermissionDeniedError) {
      return "provider_permission_denied";
    }
    if (error instanceof RateLimitError) return "provider_rate_limited";
    if (
      error instanceof BadRequestError ||
      error instanceof UnprocessableEntityError
    ) {
      return "provider_request_rejected";
    }
    if (
      error instanceof APIConnectionError ||
      (error instanceof APIError &&
        typeof error.status === "number" &&
        error.status >= 500)
    ) {
      return "provider_unavailable";
    }
    if (error instanceof APIError) {
      if (error.status === 401) return "provider_authentication";
      if (error.status === 403) return "provider_permission_denied";
      if (error.status === 429) return "provider_rate_limited";
      if (error.status === 400 || error.status === 422) {
        return "provider_request_rejected";
      }
      return "provider_error";
    }
    return "provider_error";
  }

  private elapsedMilliseconds(startedAt: number): number {
    return Math.max(0, Math.round(performance.now() - startedAt));
  }
}
