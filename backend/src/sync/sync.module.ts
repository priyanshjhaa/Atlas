import { Module } from "@nestjs/common";
import { GitHubAppService } from "../connectors/github-app.service";
import { IntelligenceModule } from "../intelligence/intelligence.module";
import { SyncJobsController } from "./sync-jobs.controller";
import { SyncJobsRepository } from "./sync-jobs.repository";
import { SyncJobsService } from "./sync-jobs.service";
import { SyncQueueService } from "./sync-queue.service";
import { SyncWorkerService } from "./sync-worker.service";

@Module({
  imports: [IntelligenceModule],
  controllers: [SyncJobsController],
  providers: [
    GitHubAppService,
    SyncJobsRepository,
    SyncJobsService,
    SyncQueueService,
    SyncWorkerService,
  ],
  exports: [SyncQueueService, SyncWorkerService],
})
export class SyncModule {}
