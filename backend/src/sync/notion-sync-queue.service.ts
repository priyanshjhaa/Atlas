import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import type { Environment } from "../config/environment";
import { redisConnectionFromUrl } from "./redis-connection";
import {
  notionSyncJobName,
  notionSyncQueueName,
  type NotionSyncJobData,
} from "./sync.types";

@Injectable()
export class NotionSyncQueueService implements OnModuleDestroy {
  private readonly queue: Queue<NotionSyncJobData>;

  constructor(config: ConfigService<Environment, true>) {
    this.queue = new Queue(notionSyncQueueName, {
      connection: redisConnectionFromUrl(
        config.get("REDIS_URL", { infer: true }),
      ),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1_000 },
        removeOnFail: { age: 30 * 24 * 60 * 60, count: 2_000 },
      },
    });
  }

  enqueue(data: NotionSyncJobData) {
    return this.queue.add(notionSyncJobName, data, {
      jobId: data.notionSyncJobId,
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
