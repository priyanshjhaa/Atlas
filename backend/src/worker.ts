import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { SyncWorkerService } from "./sync/sync-worker.service";

async function bootstrap() {
  const application = await NestFactory.createApplicationContext(AppModule);
  application.get(SyncWorkerService).start();

  const shutdown = async () => {
    await application.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

void bootstrap();
