import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { SyncQueueService } from "../sync/sync-queue.service";

export interface ServiceStatus {
  status: "ok" | "ready";
  service: "atlas-api";
  timestamp: string;
  checks?: {
    configuration: "ok";
    database: "ok";
    redis: "ok";
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly syncQueue: SyncQueueService,
  ) {}

  health(): ServiceStatus {
    return {
      status: "ok",
      service: "atlas-api",
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<ServiceStatus> {
    try {
      await this.database.ping();
    } catch {
      throw new ServiceUnavailableException({
        status: "not_ready",
        service: "atlas-api",
        checks: {
          configuration: "ok",
          database: "unavailable",
        },
      });
    }
    try {
      await this.syncQueue.ping();
    } catch {
      throw new ServiceUnavailableException({
        status: "not_ready",
        service: "atlas-api",
        checks: {
          configuration: "ok",
          database: "ok",
          redis: "unavailable",
        },
      });
    }

    return {
      status: "ready",
      service: "atlas-api",
      timestamp: new Date().toISOString(),
      checks: {
        configuration: "ok",
        database: "ok",
        redis: "ok",
      },
    };
  }
}
