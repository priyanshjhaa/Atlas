import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
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
import {
  zodResponseFormat,
  zodTextFormat,
} from "openai/helpers/zod";
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
import {
  IMPACT_EXPLANATION_SCHEMA_VERSION,
  type ImpactExplanation,
} from "./explanation.types";

export const OPENAI_EXPLANATION_CLIENT = Symbol(
  "OPENAI_EXPLANATION_CLIENT",
);

@Injectable()
export class OpenAIExplanationClient implements ExplanationClient {
  private readonly logger = new Logger(OpenAIExplanationClient.name);
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
    const providerPacket = this.providerPacket(packet);
    const startedAt = performance.now();
    if (provider === "groq") {
      return this.generateWithGroq(
        providerPacket,
        apiKey,
        model,
        timeout,
        startedAt,
      );
    }

    const request = {
      model,
      instructions: IMPACT_EXPLANATION_SYSTEM_PROMPT,
      input: [
        {
          role: "user" as const,
          content: [
            {
              type: "input_text" as const,
              text: this.packetInput(providerPacket.packet),
            },
          ],
        },
      ],
      text: {
        format: zodTextFormat(
          impactExplanationProviderSchema(
            providerPacket.packet.evidence.map((item) => item.id),
            providerPacket.packet.limitations.length > 0 ||
              providerPacket.packet.unknownImpacts.length > 0,
          ),
          "atlas_impact_explanation_v1",
        ),
      },
      max_output_tokens: this.config.get("LLM_MAX_OUTPUT_TOKENS", {
        infer: true,
      }),
      tools: [],
      store: false,
    };

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
        explanation: this.restoreEvidenceIds(
          response.output_parsed,
          providerPacket.aliasToEvidenceId,
        ),
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
      return this.providerFailure(error, provider, model, startedAt);
    }
  }

  private async generateWithGroq(
    providerPacket: ReturnType<OpenAIExplanationClient["providerPacket"]>,
    apiKey: string,
    model: string,
    timeout: number,
    startedAt: number,
  ): Promise<ExplanationGenerationResult> {
    try {
      const completion = await this.openai(
        apiKey,
        timeout,
        "groq",
      ).chat.completions.parse(
        {
          model,
          messages: [
            {
              role: "system",
              content: IMPACT_EXPLANATION_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: this.packetInput(providerPacket.packet),
            },
          ],
          response_format: zodResponseFormat(
            impactExplanationProviderSchema(
              providerPacket.packet.evidence.map((item) => item.id),
              providerPacket.packet.limitations.length > 0 ||
                providerPacket.packet.unknownImpacts.length > 0,
            ),
            "atlas_impact_explanation_v1",
          ),
          max_completion_tokens: this.config.get(
            "LLM_MAX_OUTPUT_TOKENS",
            { infer: true },
          ),
          reasoning_effort: this.config.get("LLM_REASONING_EFFORT", {
            infer: true,
          }),
          temperature: 0.01,
          tools: [],
        },
        {
          maxRetries: 0,
          timeout,
          signal: AbortSignal.timeout(timeout),
        },
      );
      const latencyMs = this.elapsedMilliseconds(startedAt);
      const parsed = completion.choices[0]?.message.parsed;
      if (!parsed) {
        return {
          status: "failed",
          failureCode:
            completion.choices[0]?.message.refusal
              ? "provider_refusal"
              : "invalid_provider_response",
          latencyMs,
        };
      }
      return {
        status: "completed",
        explanation: this.restoreEvidenceIds(
          parsed,
          providerPacket.aliasToEvidenceId,
        ),
        metadata: {
          provider: "groq",
          model,
          promptVersion: IMPACT_EXPLANATION_PROMPT_VERSION,
          outputSchemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
          latencyMs,
          usage: {
            inputTokens: completion.usage?.prompt_tokens ?? 0,
            outputTokens: completion.usage?.completion_tokens ?? 0,
            totalTokens: completion.usage?.total_tokens ?? 0,
          },
        },
      };
    } catch (error: unknown) {
      return this.providerFailure(error, "groq", model, startedAt);
    }
  }

  private providerFailure(
    error: unknown,
    provider: "openai" | "groq",
    model: string,
    startedAt: number,
  ): ExplanationGenerationResult {
    const failureCode = this.normalizeError(error);
    this.logger.warn({
      event: "impact_explanation_provider_request_failed",
      provider,
      model,
      failureCode,
      ...this.safeErrorMetadata(error),
    });
    return {
      status: "failed",
      failureCode,
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
    const allowedFilePaths = [
      ...new Set([
        ...packet.directImpacts.flatMap((item) =>
          item.filePath ? [item.filePath] : [],
        ),
        ...packet.downstreamImpacts.flatMap((item) =>
          item.filePath ? [item.filePath] : [],
        ),
        ...packet.relationshipPaths.map((item) => item.filePath),
        ...packet.evidence.map((item) => item.filePath),
      ]),
    ].sort();
    const allowedSymbols = [
      ...new Set([
        ...packet.directImpacts.flatMap((item) =>
          item.symbol ? [item.symbol] : [],
        ),
        ...packet.downstreamImpacts.flatMap((item) =>
          item.symbol ? [item.symbol] : [],
        ),
        ...packet.evidence.flatMap((item) =>
          item.symbol ? [item.symbol] : [],
        ),
      ]),
    ].sort();
    return [
      "The following JSON is the complete authorized evidence packet.",
      `ALLOWED_FILE_PATHS=${JSON.stringify(allowedFilePaths)}`,
      `ALLOWED_SYMBOLS=${JSON.stringify(allowedSymbols)}`,
      "Any file path or symbol in the response MUST be copied exactly from these allowlists.",
      "If a migration artifact, test, configuration, or implementation location is absent, refer to it generically without a filename, extension, slash, or code-formatted identifier.",
      "BEGIN_ATLAS_EVIDENCE_PACKET",
      JSON.stringify(packet),
      "END_ATLAS_EVIDENCE_PACKET",
    ].join("\n");
  }

  private providerPacket(packet: ImpactEvidencePacket): {
    packet: ImpactEvidencePacket;
    aliasToEvidenceId: Map<string, string>;
  } {
    const evidenceIdToAlias = new Map(
      packet.evidence.map((item, index) => [item.id, `E${index + 1}`]),
    );
    const aliasToEvidenceId = new Map(
      [...evidenceIdToAlias].map(([evidenceId, alias]) => [
        alias,
        evidenceId,
      ]),
    );
    const aliasEvidenceIds = (evidenceIds: string[]) =>
      evidenceIds.flatMap((id) => {
        const alias = evidenceIdToAlias.get(id);
        return alias ? [alias] : [];
      });
    const aliasFindings = (findings: ImpactEvidencePacket["directImpacts"]) =>
      findings.map((finding) => ({
        ...finding,
        evidenceIds: aliasEvidenceIds(finding.evidenceIds),
      }));

    return {
      packet: {
        ...packet,
        directImpacts: aliasFindings(packet.directImpacts),
        downstreamImpacts: aliasFindings(packet.downstreamImpacts),
        unknownImpacts: aliasFindings(packet.unknownImpacts),
        evidence: packet.evidence.map((item) => ({
          ...item,
          id: evidenceIdToAlias.get(item.id) ?? item.id,
        })),
      },
      aliasToEvidenceId,
    };
  }

  private restoreEvidenceIds(
    explanation: ImpactExplanation,
    aliasToEvidenceId: Map<string, string>,
  ): ImpactExplanation {
    const restore = (evidenceIds: string[]) =>
      evidenceIds.map((id) => aliasToEvidenceId.get(id) ?? id);
    return {
      ...explanation,
      claims: explanation.claims.map((claim) => ({
        ...claim,
        evidenceIds: restore(claim.evidenceIds),
      })),
      implementationSteps: explanation.implementationSteps.map((step) => ({
        ...step,
        evidenceIds: restore(step.evidenceIds),
      })),
      verificationSteps: explanation.verificationSteps.map((step) => ({
        ...step,
        evidenceIds: restore(step.evidenceIds),
      })),
    };
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
      if (providerError.status === 400 || providerError.status === 422) {
        return "provider_request_rejected";
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

  private safeErrorMetadata(error: unknown): {
    providerStatus: number | null;
    providerCode: string | null;
    errorType: string;
  } {
    if (!error || typeof error !== "object") {
      return {
        providerStatus: null,
        providerCode: null,
        errorType: typeof error,
      };
    }
    const value = error as {
      status?: unknown;
      code?: unknown;
      name?: unknown;
    };
    return {
      providerStatus:
        typeof value.status === "number" ? value.status : null,
      providerCode: typeof value.code === "string" ? value.code : null,
      errorType: typeof value.name === "string" ? value.name : "Error",
    };
  }

  private elapsedMilliseconds(startedAt: number): number {
    return Math.max(0, Math.round(performance.now() - startedAt));
  }
}
