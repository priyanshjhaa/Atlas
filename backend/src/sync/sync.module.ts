import { Module } from "@nestjs/common";
import { ConnectorsModule } from "../connectors/connectors.module";
import { IntelligenceModule } from "../intelligence/intelligence.module";
import { NotionSyncJobsController } from "./notion-sync-jobs.controller";
import { NotionSyncJobsRepository } from "./notion-sync-jobs.repository";
import { NotionSyncJobsService } from "./notion-sync-jobs.service";
import { NotionSyncQueueService } from "./notion-sync-queue.service";
import { NotionSyncWorkerService } from "./notion-sync-worker.service";
import { SyncJobsController } from "./sync-jobs.controller";
import { SyncJobsRepository } from "./sync-jobs.repository";
import { SyncJobsService } from "./sync-jobs.service";
import { SyncQueueService } from "./sync-queue.service";
import { SyncWorkerService } from "./sync-worker.service";

@Module({
  imports: [ConnectorsModule, IntelligenceModule],
  controllers: [SyncJobsController, NotionSyncJobsController],
  providers: [
    SyncJobsRepository,
    SyncJobsService,
    SyncQueueService,
    SyncWorkerService,
    NotionSyncJobsRepository,
    NotionSyncJobsService,
    NotionSyncQueueService,
    NotionSyncWorkerService,
  ],
  exports: [
    SyncQueueService,
    SyncWorkerService,
    NotionSyncQueueService,
    NotionSyncWorkerService,
  ],
})
export class SyncModule {}
