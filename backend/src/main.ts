import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import type { Environment } from "./config/environment";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const config = app.get<ConfigService<Environment, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  const trustedProxyHops = config.get("TRUST_PROXY_HOPS", { infer: true });
  if (trustedProxyHops > 0) app.set("trust proxy", trustedProxyHops);
  const maximumBodyBytes = config.get("API_MAX_BODY_BYTES", { infer: true });
  app.useBodyParser("json", { limit: maximumBodyBytes });
  app.useBodyParser("urlencoded", {
    extended: true,
    limit: maximumBodyBytes,
  });
  app.use(helmet());
  app.enableCors({
    credentials: true,
    origin: config.get("FRONTEND_ORIGIN", { infer: true }),
  });
  app.setGlobalPrefix("v1");
  app.useGlobalPipes(
    new ValidationPipe({
      forbidUnknownValues: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.enableShutdownHooks();

  const port = config.get("PORT", { infer: true });
  const host = config.get("HOST", { infer: true });
  await app.listen(port, host);
}

void bootstrap();
