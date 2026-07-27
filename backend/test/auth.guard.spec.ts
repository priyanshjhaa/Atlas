import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { AuthGuard } from "../src/auth/auth.guard";
import type { AuthRepository } from "../src/auth/auth.repository";
import type { AtlasRequest } from "../src/auth/auth.types";
import type { JwtVerifierService } from "../src/auth/jwt-verifier.service";

function executionContext(request: AtlasRequest): ExecutionContext {
  return {
    getHandler: () => executionContext,
    getClass: () => AuthGuard,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe("AuthGuard", () => {
  const reflector = {
    getAllAndOverride: vi.fn(() => false),
  } as unknown as Reflector;

  it("rejects requests without a bearer token", async () => {
    const guard = new AuthGuard(
      reflector,
      {} as JwtVerifierService,
      {} as AuthRepository,
    );

    await expect(
      guard.canActivate(executionContext({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("attaches a database-validated identity", async () => {
    const request: AtlasRequest = {
      headers: { authorization: "Bearer signed-token" },
    };
    const verifier = {
      verify: vi.fn(async () => ({
        sub: "user-1",
        sid: "session-1",
      })),
    } as unknown as JwtVerifierService;
    const repository = {
      findActiveSession: vi.fn(async () => ({
        sessionId: "session-1",
        user: {
          id: "user-1",
          name: "Atlas User",
          email: "atlas@example.com",
          image: null,
        },
      })),
    } as unknown as AuthRepository;
    const guard = new AuthGuard(reflector, verifier, repository);

    await expect(guard.canActivate(executionContext(request))).resolves.toBe(
      true,
    );
    expect(request.auth?.sessionId).toBe("session-1");
  });

  it("rejects a valid JWT after its database session is revoked", async () => {
    const verifier = {
      verify: vi.fn(async () => ({
        sub: "user-1",
        sid: "revoked-session",
      })),
    } as unknown as JwtVerifierService;
    const repository = {
      findActiveSession: vi.fn(async () => null),
    } as unknown as AuthRepository;
    const guard = new AuthGuard(reflector, verifier, repository);

    await expect(
      guard.canActivate(
        executionContext({
          headers: { authorization: "Bearer still-signed" },
        }),
      ),
    ).rejects.toThrow("expired or revoked");
  });
});
