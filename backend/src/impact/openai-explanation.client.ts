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
import { impactExplanationProviderSchema } from "./explanation.schema";
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
    const provider = this.config.get("LLM_PROVIDER", { infer: true });
    const apiKey = this.config.get(
      provider === "groq" ? "GROQ_API_KEY" : "OPENAI_API_KEY",
      { infer: true },
    );
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
    const request = {
      model,
      instructions: IMPACT_EXPLANATION_SYSTEM_PROMPT,
      input: [
        {
          role: "user" as const,
          content: [
            {
              type: "input_text" as const,
              text: this.packetInput(packet),
            },
          ],
        },
      ],
      text: {
        format: zodTextFormat(
          impactExplanationProviderSchema(
            packet.evidence.map((item) => item.id),
          ),
          "atlas_impact_explanation_v1",
        ),
      },
      max_output_tokens: this.config.get("LLM_MAX_OUTPUT_TOKENS", {
        infer: true,
      }),
      tools: [],
      ...(provider === "groq"
        ? {
            temperature: 0.1,
            reasoning: {
              effort: this.config.get("LLM_REASONING_EFFORT", {
                infer: true,
              }),
            },
          }
        : {}),
      ...(provider === "openai" ? { store: false } : {}),
    };
    const maxAttempts = provider === "groq" ? 2 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await this.openai(
          apiKey,
          timeout,
          provider,
        ).responses.parse(request, {
          maxRetries: 0,
          timeout,
          signal: AbortSignal.timeout(timeout),
        });
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
            provider,
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
        const failureCode = this.normalizeError(error);
        if (
          provider === "groq" &&
          attempt === 0 &&
          failureCode === "provider_request_rejected"
        ) {
          continue;
        }
        return {
          status: "failed",
          failureCode,
          latencyMs: this.elapsedMilliseconds(startedAt),
        };
      }
    }

    return {
      status: "failed",
      failureCode: "provider_error",
      latencyMs: this.elapsedMilliseconds(startedAt),
    };
  }

  private openai(
    apiKey: string,
    timeout: number,
    provider: "openai" | "groq",
  ): OpenAI {
    if (this.providedClient) return this.providedClient;
    this.client ??= new OpenAI({
      apiKey,
      baseURL:
        provider === "groq"
          ? this.config.get("LLM_BASE_URL", { infer: true })
          : undefined,
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
    if (error && typeof error === "object") {
      const providerError = error as { status?: number; code?: string };
      if (
        providerError.status === 429 ||
        (providerError.status === 413 &&
          providerError.code === "rate_limit_exceeded")
      ) {
        return "provider_rate_limited";
      }
    }
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
