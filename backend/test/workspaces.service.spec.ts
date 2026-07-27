import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AuthenticatedIdentity,
  WorkspaceAccess,
} from "../src/auth/auth.types";
import type { WorkspacesRepository } from "../src/workspaces/workspaces.repository";
import { WorkspacesService } from "../src/workspaces/workspaces.service";

const identity: AuthenticatedIdentity = {
  sessionId: "session-1",
  user: {
    id: "user-1",
    name: "Atlas User",
    email: "atlas@example.com",
    image: null,
  },
};

const ownerWorkspace: WorkspaceAccess = {
  id: "01951ca1-2c72-7000-8000-000000000001",
  name: "Northstar",
  slug: "northstar",
  role: "owner",
  repositoryCount: 1,
};

function member(role: WorkspaceAccess["role"] = "member") {
  return {
    id: "01951ca1-2c72-7000-8000-000000000002",
    userId: "user-2",
    name: "Second User",
    email: "second@example.com",
    image: null,
    role,
    createdAt: new Date(),
  };
}

describe("WorkspacesService", () => {
  let repository: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    listMembers: ReturnType<typeof vi.fn>;
    findMember: ReturnType<typeof vi.fn>;
    addMember: ReturnType<typeof vi.fn>;
    updateMemberRole: ReturnType<typeof vi.fn>;
    removeMember: ReturnType<typeof vi.fn>;
    listRepositories: ReturnType<typeof vi.fn>;
  };
  let service: WorkspacesService;

  beforeEach(() => {
    repository = {
      create: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      listMembers: vi.fn(),
      findMember: vi.fn(),
      addMember: vi.fn(),
      updateMemberRole: vi.fn(),
      removeMember: vi.fn(),
      listRepositories: vi.fn(),
    };
    service = new WorkspacesService(
      repository as unknown as WorkspacesRepository,
    );
  });

  it("creates a workspace owned by the current user", async () => {
    repository.create.mockResolvedValue(ownerWorkspace);

    await expect(service.create(" Northstar ", identity)).resolves.toBe(
      ownerWorkspace,
    );
    expect(repository.create).toHaveBeenCalledWith("Northstar", "user-1");
  });

  it("returns not found for an unknown workspace", async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.get(ownerWorkspace.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("requires invited users to exist and not already be members", async () => {
    repository.addMember.mockResolvedValue(null);

    await expect(
      service.addMember(
        ownerWorkspace.id,
        "new@example.com",
        "member",
        identity,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("prevents demoting the workspace owner", async () => {
    repository.findMember.mockResolvedValue(member("owner"));

    await expect(
      service.updateMemberRole(
        ownerWorkspace.id,
        member().id,
        "admin",
        identity,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("prevents an admin from removing another admin", async () => {
    repository.findMember.mockResolvedValue(member("admin"));

    await expect(
      service.removeMember(ownerWorkspace.id, member().id, identity, {
        ...ownerWorkspace,
        role: "admin",
      }),
    ).rejects.toThrow("Admins cannot remove other admins");
  });

  it("returns tenant-scoped repositories", async () => {
    const repositories = [{ id: "repository-1", name: "atlas" }];
    repository.listRepositories.mockResolvedValue(repositories);

    await expect(
      service.listRepositories(ownerWorkspace.id),
    ).resolves.toBe(repositories);
    expect(repository.listRepositories).toHaveBeenCalledWith(ownerWorkspace.id);
  });
});
