import { describe, expect, it } from "vitest";
import { HealthController } from "../src/health/health.controller";
import { HealthService } from "../src/health/health.service";

describe("HealthController", () => {
  const controller = new HealthController(new HealthService());

  it("reports liveness", () => {
    expect(controller.health()).toMatchObject({
      status: "ok",
      service: "atlas-api",
    });
  });

  it("reports configuration readiness", () => {
    expect(controller.readiness()).toMatchObject({
      status: "ready",
      service: "atlas-api",
      checks: {
        configuration: "ok",
      },
    });
  });
});
