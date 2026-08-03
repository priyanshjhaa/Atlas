import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import {
  validateEnvironment,
  type Environment,
} from "../src/config/environment";
import { RedisRateLimitStorage } from "../src/security/rate-limit-storage.service";

const environment = validateEnvironment({
  ...process.env,
  NODE_ENV: "test",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
});
const storage = new RedisRateLimitStorage(
  new ConfigService<Environment, true>(environment),
);

async function main() {
  try {
    const key = `acceptance:${randomUUID()}`;
    const first = await storage.increment(key, 2_000, 2, 500, "acceptance");
    const second = await storage.increment(key, 2_000, 2, 500, "acceptance");
    const blocked = await storage.increment(key, 2_000, 2, 500, "acceptance");
    await new Promise((resolve) => setTimeout(resolve, 650));
    const recovered = await storage.increment(
      key,
      2_000,
      2,
      500,
      "acceptance",
    );

    if (
      first.totalHits !== 1 ||
      first.isBlocked ||
      second.totalHits !== 2 ||
      second.isBlocked ||
      blocked.totalHits !== 3 ||
      !blocked.isBlocked ||
      recovered.totalHits !== 1 ||
      recovered.isBlocked
    ) {
      throw new Error(
        `Unexpected distributed rate-limit state: ${JSON.stringify({
          first,
          second,
          blocked,
          recovered,
        })}`,
      );
    }

    console.log("Redis rate-limit acceptance passed.");
  } finally {
    storage.onApplicationShutdown();
  }
}

void main();
