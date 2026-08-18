import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment";
import type {
  AuthenticatedIdentity,
  WorkspaceAccess,
  WorkspaceRole,
} from "../auth/auth.types";
import {
  WorkspacesRepository,
  type MemberRecord,
  type RepositoryRecord,
  type WorkspaceRecord,
  type WorkspaceOverviewSnapshot,
} from "./workspaces.repository";

export type SourceReadinessStatus =
  | "disconnected"
  | "skipped"
  | "indexing"
  | "ready"
  | "stale"
  | "failed";

export interface WorkspaceOverview {
  generatedAt: string;
  staleAfterHours: number;
  readiness: {
    overall: "needs_setup" | "indexing" | "ready" | "attention";
    github: {
      status: SourceReadinessStatus;
      repositoriesConnected: number;
      repositoriesReady: number;
      lastSyncedAt: string | null;
    };
    notion: {
      status: SourceReadinessStatus;
      resourcesSelected: number;
      documentsIndexed: number;
      lastSyncedAt: string | null;
    };
  };
  jobs: { active: number; failed: number };
  intelligence: {
    repositoriesIndexed: number;
    codeFiles: number;
    codeChunks: number;
    relationships: number;
    notionDocuments: number;
    notionChunks: number;
  };
  recentReports: Array<{
    id: string;
    title: string;
    status: "complete" | "insufficient_evidence";
    riskLevel: "insufficient" | "low" | "medium" | "high";
    riskScore: number | null;
    unknownCount: number;
    repository: { id: string; owner: string; name: string };
    createdAt: string;
  }>;
  attention: Array<{
    id: string;
    severity: "critical" | "warning" | "info";
    title: string;
    detail: string;
    action: { label: string; href: string };
  }>;
}

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly workspaces: WorkspacesRepository,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  create(
    name: string,
    identity: AuthenticatedIdentity,
  ): Promise<WorkspaceRecord> {
    return this.workspaces.create(name.trim(), identity.user.id);
  }

  async get(workspaceId: string): Promise<WorkspaceRecord> {
    const workspace = await this.workspaces.findById(workspaceId);
    if (!workspace) throw new NotFoundException("Workspace not found.");
    return workspace;
  }

  async overview(workspaceId: string): Promise<WorkspaceOverview> {
    const snapshot = await this.workspaces.overview(workspaceId);
    if (!snapshot) throw new NotFoundException("Workspace not found.");
    return this.buildOverview(snapshot, new Date());
  }

  async update(
    workspaceId: string,
    name: string,
    identity: AuthenticatedIdentity,
  ): Promise<WorkspaceRecord> {
    const workspace = await this.workspaces.update(
      workspaceId,
      name.trim(),
      identity.user.id,
    );
    if (!workspace) throw new NotFoundException("Workspace not found.");
    return workspace;
  }

  async completeOnboarding(
    workspaceId: string,
    identity: AuthenticatedIdentity,
  ): Promise<WorkspaceRecord> {
    const workspace = await this.workspaces.completeOnboarding(
      workspaceId,
      identity.user.id,
    );
    if (!workspace) throw new NotFoundException("Workspace not found.");
    return workspace;
  }

  listMembers(workspaceId: string): Promise<MemberRecord[]> {
    return this.workspaces.listMembers(workspaceId);
  }

  async addMember(
    workspaceId: string,
    email: string,
    role: Exclude<WorkspaceRole, "owner">,
    identity: AuthenticatedIdentity,
  ): Promise<MemberRecord> {
    const member = await this.workspaces.addMember(
      workspaceId,
      email.trim().toLowerCase(),
      role,
      identity.user.id,
    );
    if (!member) {
      throw new ConflictException(
        "The user has not signed in to Atlas or is already a member.",
      );
    }
    return member;
  }

  async updateMemberRole(
    workspaceId: string,
    memberId: string,
    role: Exclude<WorkspaceRole, "owner">,
    identity: AuthenticatedIdentity,
  ): Promise<MemberRecord> {
    const target = await this.requireMember(workspaceId, memberId);
    if (target.role === "owner") {
      throw new ForbiddenException("The workspace owner cannot be demoted.");
    }

    const member = await this.workspaces.updateMemberRole(
      workspaceId,
      memberId,
      role,
      identity.user.id,
    );
    if (!member) throw new NotFoundException("Workspace member not found.");
    return member;
  }

  async removeMember(
    workspaceId: string,
    memberId: string,
    identity: AuthenticatedIdentity,
    actorWorkspace: WorkspaceAccess,
  ): Promise<void> {
    const target = await this.requireMember(workspaceId, memberId);
    if (target.role === "owner") {
      throw new ForbiddenException("The workspace owner cannot be removed.");
    }
    if (actorWorkspace.role === "admin" && target.role === "admin") {
      throw new ForbiddenException("Admins cannot remove other admins.");
    }

    const removed = await this.workspaces.removeMember(
      workspaceId,
      memberId,
      identity.user.id,
    );
    if (!removed) throw new NotFoundException("Workspace member not found.");
  }

  listRepositories(workspaceId: string): Promise<RepositoryRecord[]> {
    return this.workspaces.listRepositories(workspaceId);
  }

  pilotMetrics(workspaceId: string) {
    return this.workspaces.pilotMetrics(workspaceId);
  }

  purgeExpiredPilotFeedback(
    workspaceId: string,
    identity: AuthenticatedIdentity,
  ) {
    const retentionDays = this.config.get(
      "PILOT_FEEDBACK_RETENTION_DAYS",
      { infer: true },
    );
    const cutoff = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1_000,
    );
    return this.workspaces.purgeExpiredPilotFeedback(
      workspaceId,
      cutoff,
      identity.user.id,
    );
  }

  private async requireMember(
    workspaceId: string,
    memberId: string,
  ): Promise<MemberRecord> {
    const member = await this.workspaces.findMember(workspaceId, memberId);
    if (!member) throw new NotFoundException("Workspace member not found.");
    return member;
  }

  private buildOverview(
    snapshot: WorkspaceOverviewSnapshot,
    now: Date,
  ): WorkspaceOverview {
    const staleAfterHours = this.config.get("DASHBOARD_STALE_SOURCE_HOURS", {
      infer: true,
    });
    const staleBefore = now.getTime() - staleAfterHours * 60 * 60 * 1_000;
    const activeRepositories = snapshot.repositories.filter((item) => item.isActive);
    const readyRepositories = activeRepositories.filter((item) => item.lastSyncedAt);
    const githubConnector = snapshot.connectors.find(
      (item) => item.provider === "github",
    );
    const notionConnector = snapshot.connectors.find(
      (item) => item.provider === "notion",
    );
    const selectedNotionResources = snapshot.notionResources.filter(
      (item) => item.isActive && item.isSelected,
    );
    const repositoryActive = snapshot.repositoryJobs.filter((item) =>
      ["queued", "running"].includes(item.status),
    ).length;
    const notionActive = snapshot.notionJobs.filter((item) =>
      ["queued", "running"].includes(item.status),
    ).length;
    const latestRepositorySync = this.latestDate(
      readyRepositories.map((item) => item.lastSyncedAt),
    );
    const latestNotionSync = this.latestDate(
      selectedNotionResources.map((item) => item.lastSyncedAt),
    );
    const repositoryFailed = snapshot.repositoryJobs.filter(
      (item) =>
        item.status === "failed" &&
        (!latestRepositorySync || item.updatedAt > latestRepositorySync),
    ).length;
    const notionFailed = snapshot.notionJobs.filter(
      (item) =>
        item.status === "failed" &&
        (!latestNotionSync || item.updatedAt > latestNotionSync),
    ).length;

    const githubStatus: SourceReadinessStatus =
      githubConnector?.status === "failed" || repositoryFailed > 0
        ? "failed"
        : repositoryActive > 0
          ? "indexing"
          : !githubConnector || githubConnector.status === "revoked" || !activeRepositories.length
            ? "disconnected"
            : !readyRepositories.length
              ? "indexing"
              : latestRepositorySync && latestRepositorySync.getTime() < staleBefore
                ? "stale"
                : "ready";
    const notionStatus: SourceReadinessStatus =
      notionConnector?.status === "failed" || notionFailed > 0
        ? "failed"
        : notionActive > 0
          ? "indexing"
          : !notionConnector || notionConnector.status === "revoked"
            ? snapshot.workspace.onboardingCompletedAt
              ? "skipped"
              : "disconnected"
            : !selectedNotionResources.length || !snapshot.counts.notionDocuments
              ? "indexing"
              : latestNotionSync && latestNotionSync.getTime() < staleBefore
                ? "stale"
                : "ready";
    const overall =
      githubStatus === "disconnected"
        ? "needs_setup"
        : githubStatus === "indexing" || notionStatus === "indexing"
          ? "indexing"
          : [githubStatus, notionStatus].includes("failed") ||
              [githubStatus, notionStatus].includes("stale")
            ? "attention"
            : "ready";
    const attention = this.attentionItems({
      githubStatus,
      notionStatus,
      failedJobs: repositoryFailed + notionFailed,
      activeJobs: repositoryActive + notionActive,
      reportCount: snapshot.recentReports.length,
    });

    return {
      generatedAt: now.toISOString(),
      staleAfterHours,
      readiness: {
        overall,
        github: {
          status: githubStatus,
          repositoriesConnected: activeRepositories.length,
          repositoriesReady: readyRepositories.length,
          lastSyncedAt: latestRepositorySync?.toISOString() ?? null,
        },
        notion: {
          status: notionStatus,
          resourcesSelected: selectedNotionResources.length,
          documentsIndexed: snapshot.counts.notionDocuments,
          lastSyncedAt: latestNotionSync?.toISOString() ?? null,
        },
      },
      jobs: {
        active: repositoryActive + notionActive,
        failed: repositoryFailed + notionFailed,
      },
      intelligence: {
        repositoriesIndexed: readyRepositories.length,
        ...snapshot.counts,
      },
      recentReports: snapshot.recentReports.map((report) => {
        const result = report.result as {
          title?: string;
          status?: "complete" | "insufficient_evidence";
          risk?: {
            level?: "insufficient" | "low" | "medium" | "high";
            score?: number | null;
          };
          unknownImpacts?: unknown[];
        };
        return {
          id: report.id,
          title: result.title ?? "Impact analysis",
          status: result.status ?? "complete",
          riskLevel: result.risk?.level ?? "insufficient",
          riskScore: result.risk?.score ?? null,
          unknownCount: result.unknownImpacts?.length ?? 0,
          repository: {
            id: report.repositoryId,
            owner: report.repositoryOwner,
            name: report.repositoryName,
          },
          createdAt: report.createdAt.toISOString(),
        };
      }),
      attention,
    };
  }

  private latestDate(values: Array<Date | null>): Date | null {
    return values.reduce<Date | null>(
      (latest, value) => (!value || (latest && latest > value) ? latest : value),
      null,
    );
  }

  private attentionItems(input: {
    githubStatus: SourceReadinessStatus;
    notionStatus: SourceReadinessStatus;
    failedJobs: number;
    activeJobs: number;
    reportCount: number;
  }): WorkspaceOverview["attention"] {
    const items: WorkspaceOverview["attention"] = [];
    if (input.failedJobs) {
      items.push({
        id: "failed-syncs",
        severity: "critical",
        title: `${input.failedJobs} source sync${input.failedJobs === 1 ? " needs" : "s need"} attention`,
        detail: "Resolve failed indexing before relying on the affected source context.",
        action: { label: "Review sources", href: "/app/sources" },
      });
    }
    if (input.githubStatus === "disconnected") {
      items.push({
        id: "connect-github",
        severity: "warning",
        title: "Connect a GitHub repository",
        detail: "Atlas needs synchronized code before it can trace dependencies or analyze changes.",
        action: { label: "Connect GitHub", href: "/app/sources" },
      });
    } else if (input.githubStatus === "stale") {
      items.push({
        id: "stale-github",
        severity: "warning",
        title: "Repository context is stale",
        detail: "Refresh GitHub so analyses reflect the latest implementation.",
        action: { label: "Refresh code", href: "/app/sources" },
      });
    }
    if (input.notionStatus === "stale") {
      items.push({
        id: "stale-notion",
        severity: "warning",
        title: "Notion context is stale",
        detail: "Refresh decisions and documentation before the next impact analysis.",
        action: { label: "Refresh Notion", href: "/app/sources" },
      });
    } else if (["skipped", "disconnected"].includes(input.notionStatus)) {
      items.push({
        id: "connect-notion",
        severity: "info",
        title: "Add decisions and documentation",
        detail: "Connect Notion to ground search and impact reports in ADRs, specifications, and runbooks.",
        action: { label: "Connect Notion", href: "/app/sources" },
      });
    }
    if (input.activeJobs) {
      items.push({
        id: "active-indexing",
        severity: "info",
        title: "Workspace context is updating",
        detail: `${input.activeJobs} indexing job${input.activeJobs === 1 ? " is" : "s are"} currently running.`,
        action: { label: "View progress", href: "/app/sources" },
      });
    }
    if (!input.reportCount && input.githubStatus === "ready") {
      items.push({
        id: "first-analysis",
        severity: "info",
        title: "Run your first impact analysis",
        detail: "Test a proposed change against the synchronized system map.",
        action: { label: "Analyze a change", href: "/app/impact/new" },
      });
    }
    return items.slice(0, 4);
  }
}
