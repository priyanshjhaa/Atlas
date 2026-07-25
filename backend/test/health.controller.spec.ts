import { describe, expect, it } from "vitest";
import { HealthController } from "../src/health/health.controller";
import { HealthService } from "../src/health/health.service";
import type { DatabaseService } from "../src/database/database.service";

describe("HealthController", () => {
  const database = {
    ping: async () => undefined,
  } as DatabaseService;
  const controller = new HealthController(new HealthService(database));

  it("reports liveness", () => {
    expect(controller.health()).toMatchObject({
      status: "ok",
      service: "atlas-api",
    });
  });

  it("reports configuration and database readiness", async () => {
    await expect(controller.readiness()).resolves.toMatchObject({
      status: "ready",
      service: "atlas-api",
      checks: {
        configuration: "ok",
        database: "ok",
      },
    });
  });
});
