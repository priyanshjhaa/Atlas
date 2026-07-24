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
});
