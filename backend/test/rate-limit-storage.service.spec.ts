import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Environment } from "../src/config/environment";
import { RedisRateLimitStorage } from "../src/security/rate-limit-storage.service";

describe("RedisRateLimitStorage", () => {
  let storage: RedisRateLimitStorage;
  let evaluate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = new RedisRateLimitStorage(
      new ConfigService({
        REDIS_URL: "redis://localhost:6379",
      }) as unknown as ConfigService<Environment, true>,
    );
    evaluate = vi.fn();
    Object.assign(storage, {
      redis: {
        eval: evaluate,
        disconnect: vi.fn(),
      },
    });
  });

  it("returns distributed hit and block state in seconds", async () => {
    evaluate.mockResolvedValue([121, 59_001, 1, 30_001]);

    await expect(
      storage.increment("route:user-1", 60_000, 120, 60_000, "default"),
    ).resolves.toEqual({
      totalHits: 121,
      timeToExpire: 60,
      isBlocked: true,
      timeToBlockExpire: 31,
    });
    expect(evaluate).toHaveBeenCalledWith(
      expect.any(String),
      2,
      expect.stringMatching(/^atlas:throttle:default:[a-f0-9]{64}:window$/),
      expect.stringMatching(/^atlas:throttle:default:[a-f0-9]{64}:block$/),
      60_000,
      120,
      60_000,
    );
  });

  it("fails closed when Redis cannot enforce the limit", async () => {
    evaluate.mockRejectedValue(new Error("redis unavailable"));

    await expect(
      storage.increment("route:user-1", 60_000, 120, 60_000, "default"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("fails closed on an invalid Redis script response", async () => {
    evaluate.mockResolvedValue(["invalid"]);

    await expect(
      storage.increment("route:user-1", 60_000, 120, 60_000, "default"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
