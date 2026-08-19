import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../src/config/environment";
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
  onboardingCompletedAt: null,
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
    completeOnboarding: ReturnType<typeof vi.fn>;
    listMembers: ReturnType<typeof vi.fn>;
    findMember: ReturnType<typeof vi.fn>;
    addMember: ReturnType<typeof vi.fn>;
    updateMemberRole: ReturnType<typeof vi.fn>;
    removeMember: ReturnType<typeof vi.fn>;
    listRepositories: ReturnType<typeof vi.fn>;
    overview: ReturnType<typeof vi.fn>;
    pilotMetrics: ReturnType<typeof vi.fn>;
    purgeExpiredPilotFeedback: ReturnType<typeof vi.fn>;
  };
  let service: WorkspacesService;

  beforeEach(() => {
    repository = {
      create: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      completeOnboarding: vi.fn(),
      listMembers: vi.fn(),
      findMember: vi.fn(),
      addMember: vi.fn(),
      updateMemberRole: vi.fn(),
      removeMember: vi.fn(),
      listRepositories: vi.fn(),
      overview: vi.fn(),
      pilotMetrics: vi.fn(),
      purgeExpiredPilotFeedback: vi.fn(),
    };
    service = new WorkspacesService(
      repository as unknown as WorkspacesRepository,
      new ConfigService({
        PILOT_FEEDBACK_RETENTION_DAYS: 180,
        DASHBOARD_STALE_SOURCE_HOURS: 24,
      }) as unknown as ConfigService<Environment, true>,
    );
  });

  it("keeps pilot metrics and retention tenant scoped", async () => {
    repository.pilotMetrics.mockResolvedValue({ feedback: { responses: 2 } });
    repository.purgeExpiredPilotFeedback.mockResolvedValue({
      deletedCount: 1,
    });

    await service.pilotMetrics(ownerWorkspace.id);
    await service.purgeExpiredPilotFeedback(ownerWorkspace.id, identity);

    expect(repository.pilotMetrics).toHaveBeenCalledWith(ownerWorkspace.id);
    expect(repository.purgeExpiredPilotFeedback).toHaveBeenCalledWith(
      ownerWorkspace.id,
      expect.any(Date),
      identity.user.id,
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

  it("completes onboarding for the current workspace", async () => {
    const completed = {
      ...ownerWorkspace,
      onboardingCompletedAt: new Date(),
    };
    repository.completeOnboarding.mockResolvedValue(completed);

    await expect(
      service.completeOnboarding(ownerWorkspace.id, identity),
    ).resolves.toBe(completed);
    expect(repository.completeOnboarding).toHaveBeenCalledWith(
      ownerWorkspace.id,
      identity.user.id,
    );
  });

  it("returns not found when onboarding targets an unknown workspace", async () => {
    repository.completeOnboarding.mockResolvedValue(null);

    await expect(
      service.completeOnboarding(ownerWorkspace.id, identity),
    ).rejects.toBeInstanceOf(NotFoundException);
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

  it("prioritizes failed and stale source context in the workspace overview", async () => {
    const now = new Date();
    const staleDate = new Date(now.getTime() - 48 * 60 * 60 * 1_000);
    repository.overview.mockResolvedValue({
      workspace: { onboardingCompletedAt: now },
      repositories: [
        {
          id: "repository-1",
          owner: "atlas",
          name: "web",
          defaultBranch: "main",
          isPrivate: true,
          isActive: true,
          lastSyncedAt: staleDate,
        },
      ],
      connectors: [
        { provider: "github", status: "active", updatedAt: now },
        { provider: "notion", status: "active", updatedAt: now },
      ],
      notionResources: [
        { isSelected: true, isActive: true, lastSyncedAt: now },
      ],
      repositoryJobs: [{ id: "github-job-1", status: "failed", result: null, repositoryOwner: "atlas", repositoryName: "web", updatedAt: now }],
      notionJobs: [{ id: "notion-job-1", status: "completed", result: { documentsUpdated: 3, versionsCreated: 2 }, updatedAt: now }],
      counts: {
        codeFiles: 14,
        codeChunks: 28,
        relationships: 7,
        notionDocuments: 3,
        notionChunks: 9,
      },
      recentReports: [
        {
          id: "report-1",
          result: {
            title: "Change authentication",
            status: "complete",
            risk: { level: "high", score: 82 },
            unknownImpacts: [{ id: "unknown-1" }],
          },
          repositoryId: "repository-1",
          repositoryOwner: "atlas",
          repositoryName: "web",
          createdAt: now,
        },
      ],
    });

    const overview = await service.overview(ownerWorkspace.id);

    expect(repository.overview).toHaveBeenCalledWith(ownerWorkspace.id);
    expect(overview.readiness).toMatchObject({
      overall: "attention",
      github: { status: "failed", repositoriesReady: 1 },
      notion: { status: "ready", documentsIndexed: 3 },
    });
    expect(overview.attention[0]).toMatchObject({
      id: "failed-syncs",
      severity: "critical",
    });
    expect(overview.recentReports[0]).toMatchObject({
      title: "Change authentication",
      riskLevel: "high",
      unknownCount: 1,
    });
    expect(overview.streams).toMatchObject({
      github: [{ title: "atlas/web", summary: "Synchronization failed" }],
      notion: [{ title: "Notion documentation", summary: "3 documents and 2 revisions indexed" }],
    });
  });

  it("represents optional Notion as skipped after onboarding", async () => {
    const now = new Date();
    repository.overview.mockResolvedValue({
      workspace: { onboardingCompletedAt: now },
      repositories: [
        {
          id: "repository-1",
          owner: "atlas",
          name: "web",
          defaultBranch: "main",
          isPrivate: true,
          isActive: true,
          lastSyncedAt: now,
        },
      ],
      connectors: [{ provider: "github", status: "active", updatedAt: now }],
      notionResources: [],
      repositoryJobs: [],
      notionJobs: [],
      counts: {
        codeFiles: 1,
        codeChunks: 2,
        relationships: 0,
        notionDocuments: 0,
        notionChunks: 0,
      },
      recentReports: [],
    });

    const overview = await service.overview(ownerWorkspace.id);

    expect(overview.readiness.overall).toBe("ready");
    expect(overview.readiness.notion.status).toBe("skipped");
    expect(overview.attention.map((item) => item.id)).toEqual([
      "connect-notion",
      "first-analysis",
    ]);
  });

  it("does not keep a source failed after a newer successful sync", async () => {
    const now = new Date();
    const oldFailure = new Date(now.getTime() - 60 * 60 * 1_000);
    repository.overview.mockResolvedValue({
      workspace: { onboardingCompletedAt: now },
      repositories: [{ id: "repository-1", owner: "atlas", name: "web", defaultBranch: "main", isPrivate: true, isActive: true, lastSyncedAt: now }],
      connectors: [{ provider: "github", status: "active", updatedAt: now }],
      notionResources: [],
      repositoryJobs: [{ id: "github-job-old", status: "failed", result: null, repositoryOwner: "atlas", repositoryName: "web", updatedAt: oldFailure }],
      notionJobs: [],
      counts: { codeFiles: 1, codeChunks: 2, relationships: 1, notionDocuments: 0, notionChunks: 0 },
      recentReports: [],
    });

    const result = await service.overview(ownerWorkspace.id);

    expect(result.readiness.github.status).toBe("ready");
    expect(result.jobs.failed).toBe(0);
    expect(result.attention[0]?.id).toBe("connect-notion");
  });

  it("returns not found for an unknown overview workspace", async () => {
    repository.overview.mockResolvedValue(null);
    await expect(service.overview(ownerWorkspace.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
