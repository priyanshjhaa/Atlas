import { describe, expect, it } from "vitest";
import { validateEnvironment } from "../src/config/environment";

describe("validateEnvironment", () => {
  it("provides safe local defaults", () => {
    const environment = validateEnvironment({});

    expect(environment.PORT).toBe(4000);
    expect(environment.FRONTEND_ORIGIN).toBe("http://localhost:3000");
    expect(environment.DATABASE_URL).toContain("postgresql://");
    expect(environment.REDIS_URL).toContain("redis://");
    expect(environment.LLM_EXPLANATIONS_ENABLED).toBe(false);
    expect(environment.LLM_EXPLANATION_TIMEOUT_MS).toBe(15_000);
    expect(environment.LLM_MAX_PACKET_CHARACTERS).toBe(60_000);
    expect(environment.LLM_MAX_OUTPUT_TOKENS).toBe(2_000);
    expect(environment.LLM_REASONING_EFFORT).toBe("low");
    expect(environment.LLM_MAX_EXPLANATION_CHARACTERS).toBe(20_000);
  });

  it("rejects an invalid port", () => {
    expect(() => validateEnvironment({ PORT: "70000" })).toThrow(
      "Invalid backend environment",
    );
  });

  it("requires the complete GitHub App configuration as one unit", () => {
    expect(() =>
      validateEnvironment({ GITHUB_APP_ID: "12345" }),
    ).toThrow("All GitHub App and connector encryption values");
  });

  it("accepts a complete GitHub App configuration", () => {
    const environment = validateEnvironment({
      GITHUB_APP_ID: "12345",
      GITHUB_APP_PRIVATE_KEY: "base64-private-key",
      GITHUB_APP_WEBHOOK_SECRET: "a-long-webhook-secret",
      CONNECTOR_ENCRYPTION_KEY: "base64-encryption-key",
    });

    expect(environment.GITHUB_APP_ID).toBe("12345");
  });

  it("requires complete Notion OAuth and encryption configuration", () => {
    expect(() =>
      validateEnvironment({ NOTION_CLIENT_ID: "notion-client" }),
    ).toThrow("NOTION_CLIENT_ID and NOTION_CLIENT_SECRET");
    expect(() =>
      validateEnvironment({
        NOTION_CLIENT_ID: "notion-client",
        NOTION_CLIENT_SECRET: "notion-secret",
      }),
    ).toThrow("CONNECTOR_ENCRYPTION_KEY is required when Notion is configured");

    expect(
      validateEnvironment({
        NOTION_CLIENT_ID: "notion-client",
        NOTION_CLIENT_SECRET: "notion-secret",
        NOTION_REDIRECT_URI: "http://localhost:3000/api/notion/callback",
        CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
      }),
    ).toMatchObject({
      NOTION_CLIENT_ID: "notion-client",
      NOTION_REDIRECT_URI: "http://localhost:3000/api/notion/callback",
    });
  });

  it("requires an API key only for remote embeddings", () => {
    expect(() =>
      validateEnvironment({ EMBEDDINGS_PROVIDER: "openai" }),
    ).toThrow("OPENAI_API_KEY is required");
    expect(validateEnvironment({ EMBEDDINGS_PROVIDER: "local" }))
      .toMatchObject({ EMBEDDINGS_PROVIDER: "local" });
  });

  it("requires model and API key only when explanations are enabled", () => {
    expect(() =>
      validateEnvironment({ LLM_EXPLANATIONS_ENABLED: "true" }),
    ).toThrow("LLM_EXPLANATION_MODEL is required");
    expect(() =>
      validateEnvironment({
        LLM_EXPLANATIONS_ENABLED: "true",
        LLM_EXPLANATION_MODEL: "configured-model",
      }),
    ).toThrow("OPENAI_API_KEY is required");

    expect(
      validateEnvironment({
        LLM_EXPLANATIONS_ENABLED: "true",
        LLM_EXPLANATION_MODEL: "configured-model",
        OPENAI_API_KEY: "test-key",
      }),
    ).toMatchObject({
      LLM_EXPLANATIONS_ENABLED: true,
      LLM_PROVIDER: "openai",
      LLM_EXPLANATION_MODEL: "configured-model",
    });

    expect(() =>
      validateEnvironment({
        LLM_EXPLANATIONS_ENABLED: "true",
        LLM_PROVIDER: "groq",
        LLM_EXPLANATION_MODEL: "openai/gpt-oss-20b",
      }),
    ).toThrow("GROQ_API_KEY is required");
    expect(
      validateEnvironment({
        LLM_EXPLANATIONS_ENABLED: "true",
        LLM_PROVIDER: "groq",
        LLM_BASE_URL: "https://api.groq.com/openai/v1",
        LLM_EXPLANATION_MODEL: "openai/gpt-oss-20b",
        GROQ_API_KEY: "test-key",
      }),
    ).toMatchObject({
      LLM_EXPLANATIONS_ENABLED: true,
      LLM_PROVIDER: "groq",
      LLM_BASE_URL: "https://api.groq.com/openai/v1",
    });
  });

  it("parses false explicitly and validates evidence limits", () => {
    expect(
      validateEnvironment({ LLM_EXPLANATIONS_ENABLED: "false" })
        .LLM_EXPLANATIONS_ENABLED,
    ).toBe(false);
    expect(() =>
      validateEnvironment({ LLM_MAX_EVIDENCE_ITEMS: "0" }),
    ).toThrow("LLM_MAX_EVIDENCE_ITEMS");
    expect(() =>
      validateEnvironment({ LLM_MAX_EVIDENCE_CHARACTERS: "200001" }),
    ).toThrow("LLM_MAX_EVIDENCE_CHARACTERS");
    expect(() =>
      validateEnvironment({ LLM_MAX_PACKET_CHARACTERS: "200001" }),
    ).toThrow("LLM_MAX_PACKET_CHARACTERS");
    expect(() =>
      validateEnvironment({ LLM_MAX_OUTPUT_TOKENS: "32769" }),
    ).toThrow("LLM_MAX_OUTPUT_TOKENS");
    expect(() =>
      validateEnvironment({ LLM_MAX_EXPLANATION_CHARACTERS: "100001" }),
    ).toThrow("LLM_MAX_EXPLANATION_CHARACTERS");
  });
});
