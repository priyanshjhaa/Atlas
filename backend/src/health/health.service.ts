import { Injectable } from "@nestjs/common";

export interface ServiceStatus {
  status: "ok" | "ready";
  service: "atlas-api";
  timestamp: string;
  checks?: {
    configuration: "ok";
  };
}

@Injectable()
export class HealthService {
  health(): ServiceStatus {
    return {
      status: "ok",
      service: "atlas-api",
      timestamp: new Date().toISOString(),
    };
  }

  readiness(): ServiceStatus {
    return {
      status: "ready",
      service: "atlas-api",
      timestamp: new Date().toISOString(),
      checks: {
        configuration: "ok",
      },
    };
  }
}
