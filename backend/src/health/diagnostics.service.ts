import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment";
import { ExplanationObservabilityService } from "../impact/explanation-observability.service";
import { NotionSyncQueueService } from "../sync/notion-sync-queue.service";
import { SyncQueueService } from "../sync/sync-queue.service";

type QueueDiagnostics =
  | {
      status: "available";
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
    }
  | { status: "unavailable" };

export interface OperationalDiagnostics {
  status: "ok" | "degraded";
  service: "atlas-api";
  release: string;
  timestamp: string;
  process: {
    uptimeSeconds: number;
    residentMemoryBytes: number;
    heapUsedBytes: number;
  };
  queues: {
    github: QueueDiagnostics;
    notion: QueueDiagnostics;
  };
  explanations: ReturnType<ExplanationObservabilityService["snapshot"]>;
  scope: "process";
}

@Injectable()
export class DiagnosticsService {
  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly githubQueue: SyncQueueService,
    private readonly notionQueue: NotionSyncQueueService,
    private readonly explanations: ExplanationObservabilityService,
  ) {}

  async snapshot(): Promise<OperationalDiagnostics> {
    const [github, notion] = await Promise.all([
      this.queueSnapshot(() => this.githubQueue.counts()),
      this.queueSnapshot(() => this.notionQueue.counts()),
    ]);
    const memory = process.memoryUsage();

    return {
      status:
        github.status === "available" && notion.status === "available"
          ? "ok"
          : "degraded",
      service: "atlas-api",
      release: this.config.get("ATLAS_RELEASE", { infer: true }),
      timestamp: new Date().toISOString(),
      process: {
        uptimeSeconds: Math.floor(process.uptime()),
        residentMemoryBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
      },
      queues: { github, notion },
      explanations: this.explanations.snapshot(),
      scope: "process",
    };
  }

  private async queueSnapshot(
    load: () => Promise<{
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
    }>,
  ): Promise<QueueDiagnostics> {
    try {
      return { status: "available", ...(await load()) };
    } catch {
      return { status: "unavailable" };
    }
  }
}
