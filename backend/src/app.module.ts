import { Module, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { validateEnvironment } from "./config/environment";
import { AuthModule } from "./auth/auth.module";
import { ConnectorsModule } from "./connectors/connectors.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { HealthService } from "./health/health.service";
import { WorkspacesModule } from "./workspaces/workspaces.module";
import { SyncModule } from "./sync/sync.module";
import { IntelligenceModule } from "./intelligence/intelligence.module";
import { ImpactModule } from "./impact/impact.module";
import { SecurityModule } from "./security/security.module";
import {
  requestIdFromHeader,
  safeRequestPath,
} from "./observability/http-logging";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    DatabaseModule,
    AuthModule,
    SecurityModule,
    ConnectorsModule,
    IntelligenceModule,
    ImpactModule,
    SyncModule,
    WorkspacesModule,
    LoggerModule.forRoot({
      forRoutes: [{ path: "{*splat}", method: RequestMethod.ALL }],
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.headers['x-hub-signature-256']",
            "req.query",
            "req.url",
            "res.headers.set-cookie",
          ],
          censor: "[REDACTED]",
        },
        genReqId: (request, response) => {
          const requestId = requestIdFromHeader(
            request.headers["x-request-id"],
          );
          response.setHeader("X-Request-Id", requestId);
          return requestId;
        },
        customProps: (request) => ({
          requestPath: safeRequestPath(request.url),
        }),
        transport: shouldPrettyPrintLogs()
          ? {
                target: "pino-pretty",
                options: {
                  colorize: true,
                  singleLine: true,
                  translateTime: "SYS:standard",
                },
            }
          : undefined,
      },
    }),
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}

function shouldPrettyPrintLogs(): boolean {
  if (process.env.LOG_PRETTY !== undefined) {
    return process.env.LOG_PRETTY.toLowerCase() === "true";
  }
  return process.env.NODE_ENV !== "production";
}
