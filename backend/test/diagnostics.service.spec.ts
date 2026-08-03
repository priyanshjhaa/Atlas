import { describe, expect, it } from "vitest";
import { DiagnosticsService } from "../src/health/diagnostics.service";

const explanationMetrics = {
  attempts: 4,
  successes: 3,
  fallbacks: 1,
  disabled: 0,
  totalLatencyMs: 120,
  inputTokens: 500,
  outputTokens: 100,
  fallbacksByCode: { provider_timeout: 1 },
};

describe("DiagnosticsService", () => {
  it("returns safe aggregate operational signals", async () => {
    const service = new DiagnosticsService(
      { get: () => "release-123" } as never,
      {
        counts: async () => ({
          waiting: 2,
          active: 1,
          delayed: 0,
          failed: 0,
        }),
      } as never,
      {
        counts: async () => ({
          waiting: 0,
          active: 1,
          delayed: 0,
          failed: 1,
        }),
      } as never,
      { snapshot: () => explanationMetrics } as never,
    );

    const snapshot = await service.snapshot();

    expect(snapshot).toMatchObject({
      status: "ok",
      service: "atlas-api",
      release: "release-123",
      queues: {
        github: { status: "available", waiting: 2, active: 1 },
        notion: { status: "available", failed: 1 },
      },
      explanations: explanationMetrics,
      scope: "process",
    });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(
      /secret|operationsToken|databaseUrl|redisUrl|workspaceId|repositoryId|prompt/i,
    );
  });

  it("degrades without leaking queue errors", async () => {
    const service = new DiagnosticsService(
      { get: () => "release-123" } as never,
      {
        counts: async () => {
          throw new Error(
            "redis://user:secret@cache.example.com private failure",
          );
        },
      } as never,
      {
        counts: async () => ({
          waiting: 0,
          active: 0,
          delayed: 0,
          failed: 0,
        }),
      } as never,
      { snapshot: () => explanationMetrics } as never,
    );

    const snapshot = await service.snapshot();

    expect(snapshot.status).toBe("degraded");
    expect(snapshot.queues.github).toEqual({ status: "unavailable" });
    expect(JSON.stringify(snapshot)).not.toContain("cache.example.com");
  });
});
