import { Controller, Get, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../auth/auth.decorators";
import {
  DiagnosticsService,
  type OperationalDiagnostics,
} from "./diagnostics.service";
import { OperationsGuard } from "./operations.guard";

@Public()
@SkipThrottle()
@UseGuards(OperationsGuard)
@Controller("diagnostics")
export class DiagnosticsController {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  @Get()
  snapshot(): Promise<OperationalDiagnostics> {
    return this.diagnostics.snapshot();
  }
}
