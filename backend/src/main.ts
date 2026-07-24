import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import type { Environment } from "./config/environment";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<Environment, true>>(ConfigService);

  app.useLogger(app.get(Logger));
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
