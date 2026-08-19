import { describe, expect, it } from "vitest";
import { validateEnvironment } from "../src/config/environment";

describe("validateEnvironment", () => {
  it("provides safe local defaults", () => {
    const environment = validateEnvironment({});

    expect(environment.PORT).toBe(4000);
    expect(environment.FRONTEND_ORIGIN).toBe("http://localhost:3000");
    expect(environment.DATABASE_URL).toContain("postgresql://");
    expect(environment.DATABASE_SSL_MODE).toBe("disable");
    expect(environment.DATABASE_POOL_MAX).toBe(10);
    expect(environment.DATABASE_CONNECTION_TIMEOUT_MS).toBe(10_000);
    expect(environment.REDIS_URL).toContain("redis://");
    expect(environment.REDIS_CONNECT_TIMEOUT_MS).toBe(2_000);
    expect(environment.API_RATE_LIMIT_TTL_MS).toBe(60_000);
    expect(environment.API_RATE_LIMIT_MAX).toBe(120);
    expect(environment.API_RATE_LIMIT_BLOCK_MS).toBe(60_000);
    expect(environment.API_MAX_BODY_BYTES).toBe(1024 * 1024);
    expect(environment.TRUST_PROXY_HOPS).toBe(0);
    expect(environment.LLM_EXPLANATIONS_ENABLED).toBe(false);
    expect(environment.LLM_EXPLANATION_TIMEOUT_MS).toBe(15_000);
    expect(environment.LLM_FALLBACK_MODEL).toBeUndefined();
    expect(environment.LLM_MAX_EVIDENCE_ITEMS).toBe(12);
    expect(environment.LLM_MAX_EVIDENCE_CHARACTERS).toBe(10_000);
    expect(environment.LLM_MAX_PACKET_CHARACTERS).toBe(14_000);
    expect(environment.LLM_MAX_OUTPUT_TOKENS).toBe(2_000);
    expect(environment.LLM_REASONING_EFFORT).toBe("low");
    expect(environment.LLM_MAX_EXPLANATION_CHARACTERS).toBe(20_000);
    expect(environment.PILOT_FEEDBACK_RETENTION_DAYS).toBe(180);
    expect(environment.DASHBOARD_STALE_SOURCE_HOURS).toBe(24);
    expect(environment.ATLAS_RELEASE).toBe("local");
    expect(environment.OPERATIONS_TOKEN).toBeUndefined();
    expect(environment.LOG_PRETTY).toBeUndefined();
  });

  it("rejects an invalid port", () => {
    expect(() => validateEnvironment({ PORT: "70000" })).toThrow(
      "Invalid backend environment",
    );
  });

  it("bounds abuse-control configuration", () => {
    expect(() =>
      validateEnvironment({ API_RATE_LIMIT_MAX: "0" }),
    ).toThrow("API_RATE_LIMIT_MAX");
    expect(() =>
      validateEnvironment({ API_MAX_BODY_BYTES: "10485761" }),
    ).toThrow("API_MAX_BODY_BYTES");
    expect(() =>
      validateEnvironment({ TRUST_PROXY_HOPS: "6" }),
    ).toThrow("TRUST_PROXY_HOPS");
  });

  it("bounds the dashboard stale-source threshold", () => {
    expect(() =>
      validateEnvironment({ DASHBOARD_STALE_SOURCE_HOURS: "0" }),
    ).toThrow("DASHBOARD_STALE_SOURCE_HOURS");
    expect(
      validateEnvironment({ DASHBOARD_STALE_SOURCE_HOURS: "72" })
        .DASHBOARD_STALE_SOURCE_HOURS,
    ).toBe(72);
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
      CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
    });

    expect(environment.GITHUB_APP_ID).toBe("12345");
  });

  it("rejects malformed connector encryption keys", () => {
    expect(() =>
      validateEnvironment({
        CONNECTOR_ENCRYPTION_KEY: "not-a-32-byte-base64-key",
      }),
    ).toThrow("base64-encoded 32-byte key");
    expect(() =>
      validateEnvironment({
        CONNECTOR_ENCRYPTION_KEY:
          `${Buffer.alloc(32).toString("base64")}!!!!`,
      }),
    ).toThrow("base64-encoded 32-byte key");
  });

  it("rejects unsafe production service configuration", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
      }),
    ).toThrow("must use a non-local HTTPS URL");
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        FRONTEND_ORIGIN: "https://atlas.example.com",
        AUTH_JWKS_URL: "https://atlas.example.com/api/auth/jwks",
        AUTH_ISSUER: "https://atlas.example.com",
        AUTH_AUDIENCE: "https://api.atlas.example.com",
        DATABASE_URL: "postgresql://atlas:secret@db.example.com:5432/atlas",
        DATABASE_SSL_MODE: "verify-full",
        REDIS_URL: "redis://cache.example.com:6379",
        CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
      }),
    ).toThrow("REDIS_URL must use a non-local rediss URL");
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        LOG_PRETTY: "true",
      }),
    ).toThrow("LOG_PRETTY must be disabled in production");
  });

  it("requires a dedicated operations token in production", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
      }),
    ).toThrow("OPERATIONS_TOKEN is required in production");
  });

  it("accepts encrypted non-local production services", () => {
    expect(
      validateEnvironment({
        NODE_ENV: "production",
        FRONTEND_ORIGIN: "https://atlas.example.com",
        AUTH_JWKS_URL: "https://atlas.example.com/api/auth/jwks",
        AUTH_ISSUER: "https://atlas.example.com",
        AUTH_AUDIENCE: "https://api.atlas.example.com",
        DATABASE_URL: "postgresql://atlas:secret@db.example.com:5432/atlas",
        DATABASE_SSL_MODE: "verify-full",
        REDIS_URL: "rediss://cache.example.com:6380",
        CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
        OPERATIONS_TOKEN: "operations-token-with-at-least-32-characters",
      }),
    ).toMatchObject({
      NODE_ENV: "production",
      DATABASE_SSL_MODE: "verify-full",
      REDIS_URL: "rediss://cache.example.com:6380",
    });
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
        LLM_FALLBACK_MODEL: "llama-3.3-70b-versatile",
        GROQ_API_KEY: "test-key",
      }),
    ).toMatchObject({
      LLM_EXPLANATIONS_ENABLED: true,
      LLM_PROVIDER: "groq",
      LLM_BASE_URL: "https://api.groq.com/openai/v1",
      LLM_FALLBACK_MODEL: "llama-3.3-70b-versatile",
    });

    expect(() =>
      validateEnvironment({
        LLM_EXPLANATIONS_ENABLED: "true",
        LLM_PROVIDER: "openai",
        LLM_EXPLANATION_MODEL: "configured-model",
        LLM_FALLBACK_MODEL: "fallback-model",
        OPENAI_API_KEY: "test-key",
      }),
    ).toThrow("supported only when LLM_PROVIDER is groq");
    expect(() =>
      validateEnvironment({
        LLM_EXPLANATIONS_ENABLED: "true",
        LLM_PROVIDER: "groq",
        LLM_EXPLANATION_MODEL: "openai/gpt-oss-20b",
        LLM_FALLBACK_MODEL: "openai/gpt-oss-20b",
        GROQ_API_KEY: "test-key",
      }),
    ).toThrow("must differ from LLM_EXPLANATION_MODEL");
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
