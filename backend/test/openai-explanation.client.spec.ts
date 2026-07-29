import { ConfigService } from "@nestjs/config";
import {
  APIConnectionTimeoutError,
  APIError,
  type OpenAI,
} from "openai";
import { describe, expect, it, vi } from "vitest";
import {
  type Environment,
  validateEnvironment,
} from "../src/config/environment";
import type { ImpactEvidencePacket } from "../src/impact/evidence-packet.types";
import { IMPACT_EVIDENCE_PACKET_VERSION } from "../src/impact/evidence-packet.types";
import { IMPACT_EXPLANATION_PROMPT_VERSION } from "../src/impact/explanation.prompt";
import { IMPACT_EXPLANATION_SCHEMA_VERSION } from "../src/impact/explanation.types";
import { OpenAIExplanationClient } from "../src/impact/openai-explanation.client";

const explanation = {
  schemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
  executiveSummary: "The session boundary has one observed consumer.",
  answer: "Update the session boundary and verify its consumer.",
  claims: [
    {
      text: "The API imports the session boundary.",
      evidenceIds: ["relationship:consumer"],
    },
  ],
  implementationSteps: [
    {
      title: "Update the session boundary",
      detail: "Preserve its observed contract.",
      evidenceIds: ["chunk:session"],
    },
  ],
  verificationSteps: [
    {
      text: "Exercise the API consumer.",
      evidenceIds: ["relationship:consumer"],
    },
  ],
  remainingQuestions: ["Dynamic consumers remain unknown."],
};

const packet: ImpactEvidencePacket = {
  packetVersion: IMPACT_EVIDENCE_PACKET_VERSION,
  question: "Rotate the session contract.",
  analysisMode: "planned",
  analysisStatus: "complete",
  repository: {
    id: "repository-1",
    owner: "atlas",
    name: "identity",
  },
  sourceRevision: "revision-1",
  risk: {
    level: "medium",
    score: 55,
    reasons: ["One observed consumer."],
  },
  directImpacts: [],
  downstreamImpacts: [],
  unknownImpacts: [],
  relationshipPaths: [],
  evidence: [],
  limitations: ["Static relationships only."],
};

function config(
  values: Record<string, unknown>,
): ConfigService<Environment, true> {
  return new ConfigService<Environment>(
    validateEnvironment(values),
  ) as unknown as ConfigService<Environment, true>;
}

function fakeClient(parse: ReturnType<typeof vi.fn>): OpenAI {
  return {
    responses: { parse },
  } as unknown as OpenAI;
}

describe("OpenAIExplanationClient", () => {
  it("returns disabled without creating a provider request", async () => {
    const parse = vi.fn();
    const client = new OpenAIExplanationClient(
      config({ LLM_EXPLANATIONS_ENABLED: "false" }),
      fakeClient(parse),
    );

    await expect(client.generate(packet)).resolves.toEqual({
      status: "disabled",
    });
    expect(parse).not.toHaveBeenCalled();
  });

  it("makes one structured request without tools and captures metadata", async () => {
    const parse = vi.fn().mockResolvedValue({
      status: "completed",
      output: [],
      output_parsed: explanation,
      usage: {
        input_tokens: 120,
        output_tokens: 45,
        total_tokens: 165,
      },
    });
    const client = new OpenAIExplanationClient(
      config({
        LLM_EXPLANATIONS_ENABLED: "true",
        LLM_EXPLANATION_MODEL: "configured-model",
        LLM_EXPLANATION_TIMEOUT_MS: "3210",
        OPENAI_API_KEY: "test-key",
      }),
      fakeClient(parse),
    );

    const result = await client.generate(packet);

    expect(result).toMatchObject({
      status: "completed",
      explanation,
      metadata: {
        provider: "openai",
        model: "configured-model",
        promptVersion: IMPACT_EXPLANATION_PROMPT_VERSION,
        outputSchemaVersion: IMPACT_EXPLANATION_SCHEMA_VERSION,
        usage: {
          inputTokens: 120,
          outputTokens: 45,
          totalTokens: 165,
        },
      },
    });
    expect(parse).toHaveBeenCalledTimes(1);
    const [request, options] = parse.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(request).toMatchObject({
      model: "configured-model",
      tools: [],
      store: false,
    });
    expect(request).toHaveProperty("text.format.type", "json_schema");
    expect(JSON.stringify(request)).toContain("BEGIN_ATLAS_EVIDENCE_PACKET");
    expect(options).toMatchObject({
      maxRetries: 0,
      timeout: 3210,
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses Groq metadata and omits unsupported response storage", async () => {
    const parse = vi.fn().mockResolvedValue({
      status: "completed",
      output: [],
      output_parsed: explanation,
      usage: {
        input_tokens: 120,
        output_tokens: 45,
        total_tokens: 165,
      },
    });
    const client = new OpenAIExplanationClient(
      config({
        LLM_EXPLANATIONS_ENABLED: "true",
        LLM_PROVIDER: "groq",
        LLM_BASE_URL: "https://api.groq.com/openai/v1",
        LLM_EXPLANATION_MODEL: "openai/gpt-oss-20b",
        GROQ_API_KEY: "test-key",
      }),
      fakeClient(parse),
    );

    await expect(client.generate(packet)).resolves.toMatchObject({
      status: "completed",
      metadata: {
        provider: "groq",
        model: "openai/gpt-oss-20b",
      },
    });
    const [request] = parse.mock.calls[0] as [Record<string, unknown>];
    expect(request).not.toHaveProperty("store");
    expect(request).toHaveProperty("text.format.type", "json_schema");
    expect(request).toHaveProperty("max_output_tokens", 2_000);
    expect(request).toHaveProperty("reasoning.effort", "low");
    expect(request).toHaveProperty("temperature", 0.1);
  });

  it("retries one transient Groq structured-generation rejection", async () => {
    const parse = vi
      .fn()
      .mockRejectedValueOnce(
        new APIError(
          400,
          { error: { type: "invalid_request_error" } },
          "raw generated JSON rejection",
          new Headers(),
        ),
      )
      .mockResolvedValueOnce({
        status: "completed",
        output: [],
        output_parsed: explanation,
        usage: {
          input_tokens: 120,
          output_tokens: 45,
          total_tokens: 165,
        },
      });
    const client = new OpenAIExplanationClient(
      config({
        LLM_EXPLANATIONS_ENABLED: "true",
        LLM_PROVIDER: "groq",
        LLM_EXPLANATION_MODEL: "openai/gpt-oss-20b",
        GROQ_API_KEY: "test-key",
      }),
      fakeClient(parse),
    );

    await expect(client.generate(packet)).resolves.toMatchObject({
      status: "completed",
      metadata: { provider: "groq" },
    });
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("normalizes timeouts without exposing provider errors", async () => {
    const parse = vi
      .fn()
      .mockRejectedValue(
        new APIConnectionTimeoutError({ message: "raw provider timeout" }),
      );
    const client = new OpenAIExplanationClient(
      config({
        LLM_EXPLANATIONS_ENABLED: "true",
        LLM_EXPLANATION_MODEL: "configured-model",
        OPENAI_API_KEY: "test-key",
      }),
      fakeClient(parse),
    );

    const result = await client.generate(packet);

    expect(result).toMatchObject({
      status: "failed",
      failureCode: "provider_timeout",
    });
    expect(JSON.stringify(result)).not.toContain("raw provider timeout");
  });

  it("normalizes rate limits and malformed provider output", async () => {
    const rateLimit = new APIError(
      429,
      {},
      "raw provider rate limit",
      new Headers(),
    );
    const rateLimitedClient = new OpenAIExplanationClient(
      config({
        LLM_EXPLANATIONS_ENABLED: "true",
        LLM_EXPLANATION_MODEL: "configured-model",
        OPENAI_API_KEY: "test-key",
      }),
      fakeClient(vi.fn().mockRejectedValue(rateLimit)),
    );
    await expect(rateLimitedClient.generate(packet)).resolves.toMatchObject({
      status: "failed",
      failureCode: "provider_rate_limited",
    });

    const oversizedClient = new OpenAIExplanationClient(
      config({
        LLM_EXPLANATIONS_ENABLED: "true",
        LLM_PROVIDER: "groq",
        LLM_EXPLANATION_MODEL: "openai/gpt-oss-20b",
        GROQ_API_KEY: "test-key",
      }),
      fakeClient(
        vi.fn().mockRejectedValue(
          Object.assign(new Error("raw token limit"), {
            status: 413,
            code: "rate_limit_exceeded",
          }),
        ),
      ),
    );
    await expect(oversizedClient.generate(packet)).resolves.toMatchObject({
      status: "failed",
      failureCode: "provider_rate_limited",
    });

    const malformedClient = new OpenAIExplanationClient(
      config({
        LLM_EXPLANATIONS_ENABLED: "true",
        LLM_EXPLANATION_MODEL: "configured-model",
        OPENAI_API_KEY: "test-key",
      }),
      fakeClient(
        vi.fn().mockResolvedValue({
          status: "completed",
          output: [],
          output_parsed: null,
        }),
      ),
    );
    await expect(malformedClient.generate(packet)).resolves.toMatchObject({
      status: "failed",
      failureCode: "invalid_provider_response",
    });
  });

  it("normalizes refusals and incomplete responses", async () => {
    const refusalClient = new OpenAIExplanationClient(
      config({
        LLM_EXPLANATIONS_ENABLED: "true",
        LLM_EXPLANATION_MODEL: "configured-model",
        OPENAI_API_KEY: "test-key",
      }),
      fakeClient(
        vi.fn().mockResolvedValue({
          status: "completed",
          output_parsed: null,
          output: [
            {
              type: "message",
              content: [{ type: "refusal", refusal: "raw refusal detail" }],
            },
          ],
        }),
      ),
    );
    const refusal = await refusalClient.generate(packet);
    expect(refusal).toMatchObject({
      status: "failed",
      failureCode: "provider_refusal",
    });
    expect(JSON.stringify(refusal)).not.toContain("raw refusal detail");

    const incompleteClient = new OpenAIExplanationClient(
      config({
        LLM_EXPLANATIONS_ENABLED: "true",
        LLM_EXPLANATION_MODEL: "configured-model",
        OPENAI_API_KEY: "test-key",
      }),
      fakeClient(
        vi.fn().mockResolvedValue({
          status: "incomplete",
          output_parsed: null,
          output: [],
        }),
      ),
    );
    await expect(incompleteClient.generate(packet)).resolves.toMatchObject({
      status: "failed",
      failureCode: "provider_incomplete",
    });
  });
});
