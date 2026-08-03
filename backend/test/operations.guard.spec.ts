import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { OperationsGuard } from "../src/health/operations.guard";

const operationsToken = "operations-token-with-at-least-32-characters";

function context(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization },
      }),
    }),
  } as ExecutionContext;
}

describe("OperationsGuard", () => {
  it("accepts only the configured bearer token", () => {
    const guard = new OperationsGuard({
      get: () => operationsToken,
    } as never);

    expect(
      guard.canActivate(context(`Bearer ${operationsToken}`)),
    ).toBe(true);
    expect(() =>
      guard.canActivate(context("Bearer incorrect-token")),
    ).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context())).toThrow(
      UnauthorizedException,
    );
  });

  it("fails closed when the operations token is not configured", () => {
    const guard = new OperationsGuard({
      get: () => undefined,
    } as never);

    expect(() =>
      guard.canActivate(context(`Bearer ${operationsToken}`)),
    ).toThrow(UnauthorizedException);
  });
});
