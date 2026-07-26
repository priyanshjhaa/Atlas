import { describe, expect, it } from "vitest";
import { validateEnvironment } from "../src/config/environment";

describe("validateEnvironment", () => {
  it("provides safe local defaults", () => {
    const environment = validateEnvironment({});

    expect(environment.PORT).toBe(4000);
    expect(environment.FRONTEND_ORIGIN).toBe("http://localhost:3000");
    expect(environment.DATABASE_URL).toContain("postgresql://");
    expect(environment.REDIS_URL).toContain("redis://");
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
});
