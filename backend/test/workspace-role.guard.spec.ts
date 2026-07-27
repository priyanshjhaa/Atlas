import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "../src/auth/auth.repository";
import type { AtlasRequest } from "../src/auth/auth.types";
import { WorkspaceRoleGuard } from "../src/auth/workspace-role.guard";

const workspaceId = "01951ca1-2c72-7000-8000-000000000001";

function executionContext(request: AtlasRequest): ExecutionContext {
  return {
    getHandler: () => executionContext,
    getClass: () => WorkspaceRoleGuard,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function authenticatedRequest(roleHeader = workspaceId): AtlasRequest {
  return {
    headers: { "x-atlas-workspace-id": roleHeader },
    auth: {
      sessionId: "session-1",
      user: {
        id: "user-1",
        name: "Atlas User",
        email: "atlas@example.com",
        image: null,
      },
    },
  };
}

describe("WorkspaceRoleGuard", () => {
  const reflector = {
    getAllAndOverride: vi.fn(() => ["owner", "admin"]),
  } as unknown as Reflector;

  it("rejects access when membership is absent", async () => {
    const repository = {
      findWorkspaceAccess: vi.fn(async () => null),
    } as unknown as AuthRepository;
    const guard = new WorkspaceRoleGuard(reflector, repository);

    await expect(
      guard.canActivate(executionContext(authenticatedRequest())),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects an insufficient workspace role", async () => {
    const repository = {
      findWorkspaceAccess: vi.fn(async () => ({
        id: workspaceId,
        name: "Northstar",
        slug: "northstar",
        role: "viewer",
      })),
    } as unknown as AuthRepository;
    const guard = new WorkspaceRoleGuard(reflector, repository);

    await expect(
      guard.canActivate(executionContext(authenticatedRequest())),
    ).rejects.toThrow("required workspace role");
  });

  it("attaches workspace access for an allowed role", async () => {
    const request = authenticatedRequest();
    const repository = {
      findWorkspaceAccess: vi.fn(async () => ({
        id: workspaceId,
        name: "Northstar",
        slug: "northstar",
        role: "owner",
      })),
    } as unknown as AuthRepository;
    const guard = new WorkspaceRoleGuard(reflector, repository);

    await expect(guard.canActivate(executionContext(request))).resolves.toBe(
      true,
    );
    expect(request.workspace?.role).toBe("owner");
  });
});
