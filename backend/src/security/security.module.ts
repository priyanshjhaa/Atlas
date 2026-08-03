import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import {
  ThrottlerGuard,
  ThrottlerModule,
  type ThrottlerModuleOptions,
} from "@nestjs/throttler";
import type { Environment } from "../config/environment";
import { RedisRateLimitStorage } from "./rate-limit-storage.service";

@Module({
  providers: [RedisRateLimitStorage],
  exports: [RedisRateLimitStorage],
})
class RateLimitStorageModule {}

@Module({
  imports: [
    RateLimitStorageModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RateLimitStorageModule],
      inject: [ConfigService, RedisRateLimitStorage],
      useFactory: (
        config: ConfigService<Environment, true>,
        storage: RedisRateLimitStorage,
      ): ThrottlerModuleOptions => ({
        storage,
        throttlers: [
          {
            name: "default",
            ttl: config.get("API_RATE_LIMIT_TTL_MS", { infer: true }),
            limit: config.get("API_RATE_LIMIT_MAX", { infer: true }),
            blockDuration: config.get("API_RATE_LIMIT_BLOCK_MS", {
              infer: true,
            }),
          },
        ],
        getTracker: (request: {
          auth?: { user?: { id?: string } };
          ip?: string;
        }) =>
          request.auth?.user?.id
            ? `user:${request.auth.user.id}`
            : `ip:${request.ip ?? "unknown"}`,
        errorMessage: "Too many requests. Please retry after the limit resets.",
      }),
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class SecurityModule {}
