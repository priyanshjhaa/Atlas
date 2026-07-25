import { Controller, Get } from "@nestjs/common";
import { HealthService, type ServiceStatus } from "./health.service";

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("health")
  health(): ServiceStatus {
    return this.healthService.health();
  }

  @Get("ready")
  readiness(): Promise<ServiceStatus> {
    return this.healthService.readiness();
  }
}
