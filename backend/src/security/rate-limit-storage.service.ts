import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ThrottlerStorage } from "@nestjs/throttler";
import { createHash } from "node:crypto";
import Redis from "ioredis";
import type { Environment } from "../config/environment";

const incrementScript = `
local block_ttl = redis.call("PTTL", KEYS[2])
if block_ttl > 0 then
  local blocked_hits = tonumber(redis.call("GET", KEYS[1]) or ARGV[2])
  return { blocked_hits, redis.call("PTTL", KEYS[1]), 1, block_ttl }
end

local hits = redis.call("INCR", KEYS[1])
if hits == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end

local window_ttl = redis.call("PTTL", KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call("SET", KEYS[1], ARGV[2], "PX", ARGV[3])
  redis.call("SET", KEYS[2], "1", "PX", ARGV[3])
  return { hits, tonumber(ARGV[3]), 1, tonumber(ARGV[3]) }
end

return { hits, window_ttl, 0, 0 }
`;

interface RateLimitStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

@Injectable()
export class RedisRateLimitStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly redis: Redis;
  private readonly logger = new Logger(RedisRateLimitStorage.name);

  constructor(config: ConfigService<Environment, true>) {
    this.redis = new Redis(config.get("REDIS_URL", { infer: true }), {
      connectTimeout: config.get("REDIS_CONNECT_TIMEOUT_MS", { infer: true }),
      enableOfflineQueue: true,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    this.redis.on("error", (error: Error) => {
      this.logger.warn({
        event: "api_rate_limit_redis_error",
        errorType: error.name,
      });
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<RateLimitStorageRecord> {
    const digest = createHash("sha256").update(key).digest("hex");
    const prefix = `atlas:throttle:${throttlerName}:${digest}`;
    try {
      const result = await this.redis.eval(
        incrementScript,
        2,
        `${prefix}:window`,
        `${prefix}:block`,
        ttl,
        limit,
        blockDuration,
      );
      return parseStorageRecord(result);
    } catch {
      throw new ServiceUnavailableException(
        "API rate limiting is temporarily unavailable.",
      );
    }
  }

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}

function parseStorageRecord(value: unknown): RateLimitStorageRecord {
  if (!isNumberTuple(value)) {
    throw new Error("Redis returned an invalid rate-limit response.");
  }
  const [totalHits, timeToExpireMs, blocked, timeToBlockExpireMs] = value;
  return {
    totalHits,
    timeToExpire: millisecondsToSeconds(timeToExpireMs),
    isBlocked: blocked === 1,
    timeToBlockExpire: millisecondsToSeconds(timeToBlockExpireMs),
  };
}

function isNumberTuple(
  value: unknown,
): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item: unknown) => typeof item === "number")
  );
}

function millisecondsToSeconds(value: number): number {
  return Math.max(0, Math.ceil(value / 1_000));
}
