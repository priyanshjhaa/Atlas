import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface ServiceStatus {
  status: "ok" | "ready";
  service: "atlas-api";
  timestamp: string;
  checks?: {
    configuration: "ok";
    database: "ok";
  };
}

@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseService) {}

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

    return {
      status: "ready",
      service: "atlas-api",
      timestamp: new Date().toISOString(),
      checks: {
        configuration: "ok",
        database: "ok",
      },
    };
  }
}
