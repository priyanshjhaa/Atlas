import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import type { Environment } from "../config/environment";
import { redisConnectionFromUrl } from "./redis-connection";
import {
  repositorySyncJobName,
  repositorySyncQueueName,
  type RepositorySyncJobData,
} from "./sync.types";

@Injectable()
export class SyncQueueService implements OnModuleDestroy {
  private readonly queue: Queue<RepositorySyncJobData>;

  constructor(config: ConfigService<Environment, true>) {
    this.queue = new Queue(repositorySyncQueueName, {
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

  enqueue(data: RepositorySyncJobData) {
    return this.queue.add(repositorySyncJobName, data, {
      jobId: data.syncJobId,
    });
  }

  getJob(syncJobId: string) {
    return this.queue.getJob(syncJobId);
  }

  async ping(): Promise<void> {
    await this.queue.waitUntilReady();
  }

  async counts() {
    const counts = await this.queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed",
    );
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
