import { Injectable } from "@nestjs/common";
import { and, count, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import {
  auditEvents,
  codeChunks,
  codeFiles,
  codeRelationships,
  connectors,
  impactReportFeedback,
  impactReports,
  notionSyncJobs,
  notionDocumentChunks,
  notionDocuments,
  notionResources,
  repositories,
  repositoryPullRequestReviews,
  repositoryPullRequests,
  syncJobs,
  users,
  workspaceMembers,
  workspaces,
} from "../database/schema";
import type { GitHubActorRecord } from "../database/schema";
import type { WorkspaceRole } from "../auth/auth.types";

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  repositoryCount: number;
  onboardingCompletedAt: Date | null;
}

export interface MemberRecord {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: WorkspaceRole;
  createdAt: Date;
}

export interface RepositoryRecord {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string | null;
  isPrivate: boolean;
  isActive: boolean;
  lastSyncedAt: Date | null;
}

export interface WorkspaceOverviewSnapshot {
  workspace: { onboardingCompletedAt: Date | null };
  repositories: RepositoryRecord[];
  connectors: Array<{
    provider: "github" | "notion";
    status: "pending" | "active" | "revoked" | "failed";
    updatedAt: Date;
  }>;
  notionResources: Array<{
    isSelected: boolean;
    isActive: boolean;
    lastSyncedAt: Date | null;
  }>;
  repositoryJobs: Array<{
    id: string;
    status: "queued" | "running" | "completed" | "failed" | "cancelled";
    result: Record<string, unknown> | null;
    repositoryOwner: string;
    repositoryName: string;
    updatedAt: Date;
  }>;
  notionJobs: Array<{
    id: string;
    status: "queued" | "running" | "completed" | "failed" | "cancelled";
    result: Record<string, unknown> | null;
    updatedAt: Date;
  }>;
  counts: {
    codeFiles: number;
    codeChunks: number;
    relationships: number;
    notionDocuments: number;
    notionChunks: number;
  };
  recentReports: Array<{
    id: string;
    result: Record<string, unknown>;
    repositoryId: string;
    repositoryOwner: string;
    repositoryName: string;
    createdAt: Date;
  }>;
  recentPullRequests: Array<{
    id: string;
    repositoryOwner: string;
    repositoryName: string;
    number: number;
    title: string;
    url: string;
    state: string;
    isDraft: boolean;
    author: GitHubActorRecord | null;
    mergedBy: GitHubActorRecord | null;
    reviewsTruncated: boolean;
    providerUpdatedAt: Date;
  }>;
  recentPullRequestReviews: Array<{
    pullRequestId: string;
    providerReviewId: string;
    reviewer: GitHubActorRecord | null;
    state: string;
    submittedAt: Date | null;
    url: string;
  }>;
}

@Injectable()
export class WorkspacesRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(name: string, userId: string): Promise<WorkspaceRecord> {
    const id = crypto.randomUUID();
    const slug = `${this.slugify(name)}-${id.slice(0, 6)}`;

    await this.database.client.transaction(async (transaction) => {
      await transaction.insert(workspaces).values({
        id,
        name,
        slug,
        createdByUserId: userId,
      });
      await transaction.insert(workspaceMembers).values({
        workspaceId: id,
        userId,
        role: "owner",
      });
      await transaction.insert(auditEvents).values({
        workspaceId: id,
        actorUserId: userId,
        action: "workspace.created",
        targetType: "workspace",
        targetId: id,
      });
    });

    const workspace = await this.findById(id);
    if (!workspace) throw new Error("Created workspace could not be loaded.");
    return workspace;
  }

  async findById(workspaceId: string): Promise<WorkspaceRecord | null> {
    const [workspace] = await this.database.client
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        createdAt: workspaces.createdAt,
        updatedAt: workspaces.updatedAt,
        repositoryCount: count(repositories.id),
        onboardingCompletedAt: workspaces.onboardingCompletedAt,
      })
      .from(workspaces)
      .leftJoin(repositories, eq(repositories.workspaceId, workspaces.id))
      .where(eq(workspaces.id, workspaceId))
      .groupBy(workspaces.id)
      .limit(1);

    return workspace ?? null;
  }

  async update(
    workspaceId: string,
    name: string,
    actorUserId: string,
  ): Promise<WorkspaceRecord | null> {
    const [updated] = await this.database.client.transaction(
      async (transaction) => {
        const rows = await transaction
          .update(workspaces)
          .set({ name, updatedAt: new Date() })
          .where(eq(workspaces.id, workspaceId))
          .returning({ id: workspaces.id });

        if (rows[0]) {
          await transaction.insert(auditEvents).values({
            workspaceId,
            actorUserId,
            action: "workspace.updated",
            targetType: "workspace",
            targetId: workspaceId,
            metadata: { name },
          });
        }
        return rows;
      },
    );

    return updated ? this.findById(workspaceId) : null;
  }

  async completeOnboarding(
    workspaceId: string,
    actorUserId: string,
  ): Promise<WorkspaceRecord | null> {
    await this.database.client.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(workspaces)
        .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(workspaces.id, workspaceId),
            isNull(workspaces.onboardingCompletedAt),
          ),
        )
        .returning({ id: workspaces.id });

      if (updated) {
        await transaction.insert(auditEvents).values({
          workspaceId,
          actorUserId,
          action: "workspace.onboarding.completed",
          targetType: "workspace",
          targetId: workspaceId,
        });
      }
    });

    return this.findById(workspaceId);
  }

  listMembers(workspaceId: string): Promise<MemberRecord[]> {
    return this.database.client
      .select({
        id: workspaceMembers.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        role: workspaceMembers.role,
        createdAt: workspaceMembers.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId));
  }

  async findMember(
    workspaceId: string,
    memberId: string,
  ): Promise<MemberRecord | null> {
    const [member] = await this.database.client
      .select({
        id: workspaceMembers.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        role: workspaceMembers.role,
        createdAt: workspaceMembers.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.id, memberId),
        ),
      )
      .limit(1);

    return member ?? null;
  }

  async addMember(
    workspaceId: string,
    email: string,
    role: Exclude<WorkspaceRole, "owner">,
    actorUserId: string,
  ): Promise<MemberRecord | null> {
    const [user] = await this.database.client
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    if (!user) return null;

    const [membership] = await this.database.client.transaction(
      async (transaction) => {
        const rows = await transaction
          .insert(workspaceMembers)
          .values({ workspaceId, userId: user.id, role })
          .onConflictDoNothing({
            target: [workspaceMembers.workspaceId, workspaceMembers.userId],
          })
          .returning({ id: workspaceMembers.id });

        if (rows[0]) {
          await transaction.insert(auditEvents).values({
            workspaceId,
            actorUserId,
            action: "workspace.member.added",
            targetType: "workspace_member",
            targetId: rows[0].id,
            metadata: { userId: user.id, role },
          });
        }
        return rows;
      },
    );

    return membership ? this.findMember(workspaceId, membership.id) : null;
  }

  async updateMemberRole(
    workspaceId: string,
    memberId: string,
    role: Exclude<WorkspaceRole, "owner">,
    actorUserId: string,
  ): Promise<MemberRecord | null> {
    const [updated] = await this.database.client.transaction(
      async (transaction) => {
        const rows = await transaction
          .update(workspaceMembers)
          .set({ role, updatedAt: new Date() })
          .where(
            and(
              eq(workspaceMembers.workspaceId, workspaceId),
              eq(workspaceMembers.id, memberId),
            ),
          )
          .returning({ id: workspaceMembers.id });

        if (rows[0]) {
          await transaction.insert(auditEvents).values({
            workspaceId,
            actorUserId,
            action: "workspace.member.role_updated",
            targetType: "workspace_member",
            targetId: memberId,
            metadata: { role },
          });
        }
        return rows;
      },
    );

    return updated ? this.findMember(workspaceId, memberId) : null;
  }

  async removeMember(
    workspaceId: string,
    memberId: string,
    actorUserId: string,
  ): Promise<boolean> {
    const deleted = await this.database.client.transaction(
      async (transaction) => {
        const rows = await transaction
          .delete(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, workspaceId),
              eq(workspaceMembers.id, memberId),
            ),
          )
          .returning({ id: workspaceMembers.id });

        if (rows[0]) {
          await transaction.insert(auditEvents).values({
            workspaceId,
            actorUserId,
            action: "workspace.member.removed",
            targetType: "workspace_member",
            targetId: memberId,
          });
        }
        return rows;
      },
    );

    return deleted.length > 0;
  }

  listRepositories(workspaceId: string): Promise<RepositoryRecord[]> {
    return this.database.client
      .select({
        id: repositories.id,
        owner: repositories.owner,
        name: repositories.name,
        defaultBranch: repositories.defaultBranch,
        isPrivate: repositories.isPrivate,
        isActive: repositories.isActive,
        lastSyncedAt: repositories.lastSyncedAt,
      })
      .from(repositories)
      .where(eq(repositories.workspaceId, workspaceId));
  }

  async overview(workspaceId: string): Promise<WorkspaceOverviewSnapshot | null> {
    const workspace = await this.findById(workspaceId);
    if (!workspace) return null;

    const countFor = async (table: typeof codeFiles | typeof codeChunks | typeof codeRelationships | typeof notionDocuments | typeof notionDocumentChunks) => {
      const [row] = await this.database.client
        .select({ value: count() })
        .from(table)
        .where(eq(table.workspaceId, workspaceId));
      return row?.value ?? 0;
    };

    const [
      repositoryRows,
      connectorRows,
      resourceRows,
      repositoryJobRows,
      notionJobRows,
      codeFileCount,
      codeChunkCount,
      relationshipCount,
      notionDocumentCount,
      notionChunkCount,
      reportRows,
      pullRequestRows,
    ] = await Promise.all([
      this.listRepositories(workspaceId),
      this.database.client
        .select({
          provider: connectors.provider,
          status: connectors.status,
          updatedAt: connectors.updatedAt,
        })
        .from(connectors)
        .where(eq(connectors.workspaceId, workspaceId)),
      this.database.client
        .select({
          isSelected: notionResources.isSelected,
          isActive: notionResources.isActive,
          lastSyncedAt: notionResources.lastSyncedAt,
        })
        .from(notionResources)
        .where(eq(notionResources.workspaceId, workspaceId)),
      this.database.client
        .select({
          id: syncJobs.id,
          status: syncJobs.status,
          result: syncJobs.result,
          repositoryOwner: repositories.owner,
          repositoryName: repositories.name,
          updatedAt: syncJobs.updatedAt,
        })
        .from(syncJobs)
        .innerJoin(repositories, eq(repositories.id, syncJobs.repositoryId))
        .where(
          and(
            eq(syncJobs.workspaceId, workspaceId),
            inArray(syncJobs.status, ["queued", "running", "failed"]),
          ),
        ),
      this.database.client
        .select({
          id: notionSyncJobs.id,
          status: notionSyncJobs.status,
          result: notionSyncJobs.result,
          updatedAt: notionSyncJobs.updatedAt,
        })
        .from(notionSyncJobs)
        .where(
          and(
            eq(notionSyncJobs.workspaceId, workspaceId),
            inArray(notionSyncJobs.status, ["queued", "running", "failed"]),
          ),
        ),
      countFor(codeFiles),
      countFor(codeChunks),
      countFor(codeRelationships),
      countFor(notionDocuments),
      countFor(notionDocumentChunks),
      this.database.client
        .select({
          id: impactReports.id,
          result: impactReports.result,
          repositoryId: repositories.id,
          repositoryOwner: repositories.owner,
          repositoryName: repositories.name,
          createdAt: impactReports.createdAt,
        })
        .from(impactReports)
        .innerJoin(repositories, eq(repositories.id, impactReports.repositoryId))
        .where(eq(impactReports.workspaceId, workspaceId))
        .orderBy(desc(impactReports.createdAt))
        .limit(5),
      this.database.client
        .select({
          id: repositoryPullRequests.id,
          repositoryOwner: repositories.owner,
          repositoryName: repositories.name,
          number: repositoryPullRequests.number,
          title: repositoryPullRequests.title,
          url: repositoryPullRequests.url,
          state: repositoryPullRequests.state,
          isDraft: repositoryPullRequests.isDraft,
          author: repositoryPullRequests.author,
          mergedBy: repositoryPullRequests.mergedBy,
          reviewsTruncated: repositoryPullRequests.reviewsTruncated,
          providerUpdatedAt: repositoryPullRequests.providerUpdatedAt,
        })
        .from(repositoryPullRequests)
        .innerJoin(
          repositories,
          eq(repositories.id, repositoryPullRequests.repositoryId),
        )
        .where(eq(repositoryPullRequests.workspaceId, workspaceId))
        .orderBy(desc(repositoryPullRequests.providerUpdatedAt))
        .limit(10),
    ]);
    const pullRequestIds = pullRequestRows.map((pullRequest) => pullRequest.id);
    const pullRequestReviewRows = pullRequestIds.length
      ? await this.database.client
          .select({
            pullRequestId: repositoryPullRequestReviews.pullRequestId,
            providerReviewId:
              repositoryPullRequestReviews.providerReviewId,
            reviewer: repositoryPullRequestReviews.reviewer,
            state: repositoryPullRequestReviews.state,
            submittedAt: repositoryPullRequestReviews.submittedAt,
            url: repositoryPullRequestReviews.url,
          })
          .from(repositoryPullRequestReviews)
          .where(
            and(
              eq(repositoryPullRequestReviews.workspaceId, workspaceId),
              inArray(
                repositoryPullRequestReviews.pullRequestId,
                pullRequestIds,
              ),
            ),
          )
          .orderBy(desc(repositoryPullRequestReviews.submittedAt))
      : [];

    return {
      workspace: { onboardingCompletedAt: workspace.onboardingCompletedAt },
      repositories: repositoryRows,
      connectors: connectorRows,
      notionResources: resourceRows,
      repositoryJobs: repositoryJobRows,
      notionJobs: notionJobRows,
      counts: {
        codeFiles: codeFileCount,
        codeChunks: codeChunkCount,
        relationships: relationshipCount,
        notionDocuments: notionDocumentCount,
        notionChunks: notionChunkCount,
      },
      recentReports: reportRows,
      recentPullRequests: pullRequestRows,
      recentPullRequestReviews: pullRequestReviewRows,
    };
  }

  async pilotMetrics(workspaceId: string) {
    const [feedback, reports, repositoryJobs, notionJobs] =
      await Promise.all([
        this.database.client
          .select()
          .from(impactReportFeedback)
          .where(eq(impactReportFeedback.workspaceId, workspaceId))
          .orderBy(desc(impactReportFeedback.updatedAt))
          .limit(1_000),
        this.database.client
          .select({
            id: impactReports.id,
            createdAt: impactReports.createdAt,
            explanation: impactReports.explanation,
          })
          .from(impactReports)
          .where(eq(impactReports.workspaceId, workspaceId))
          .orderBy(desc(impactReports.createdAt))
          .limit(1_000),
        this.database.client
          .select({
            status: syncJobs.status,
            stage: syncJobs.stage,
          })
          .from(syncJobs)
          .where(eq(syncJobs.workspaceId, workspaceId))
          .limit(1_000),
        this.database.client
          .select({
            status: notionSyncJobs.status,
            stage: notionSyncJobs.stage,
          })
          .from(notionSyncJobs)
          .where(eq(notionSyncJobs.workspaceId, workspaceId))
          .limit(1_000),
      ]);
    const reportCreatedAt = new Map(
      reports.map((report) => [report.id, report.createdAt.getTime()]),
    );
    const useful = feedback.filter((item) => item.rating === "useful").length;
    const feedbackSeconds = feedback.map((item) =>
      Math.max(
        0,
        Math.round(
          (item.updatedAt.getTime() -
            (reportCreatedAt.get(item.reportId) ?? item.createdAt.getTime())) /
            1_000,
        ),
      ),
    );
    const explanationOutcomes = reports.reduce(
      (totals, report) => {
        const explanation = report.explanation as
          | {
              status?: string;
              metadata?: { attempts?: unknown[]; deterministicFallback?: boolean };
            }
          | null;
        if (explanation?.status === "completed") totals.completed += 1;
        if (explanation?.status === "failed") totals.failed += 1;
        if ((explanation?.metadata?.attempts?.length ?? 0) > 1)
          totals.modelFallbacks += 1;
        if (explanation?.metadata?.deterministicFallback)
          totals.deterministicFallbacks += 1;
        return totals;
      },
      {
        completed: 0,
        failed: 0,
        modelFallbacks: 0,
        deterministicFallbacks: 0,
      },
    );
    const jobs = [...repositoryJobs, ...notionJobs];
    const completedJobs = jobs.filter((job) => job.status === "completed");
    return {
      feedback: {
        responses: feedback.length,
        useful,
        usefulnessRate: feedback.length
          ? Math.round((useful / feedback.length) * 100)
          : null,
        confirmedFindings: feedback.reduce(
          (sum, item) => sum + item.confirmedFindingIds.length,
          0,
        ),
        missedImpacts: feedback.filter((item) => item.missedImpact).length,
        averageTimeToFeedbackSeconds: feedbackSeconds.length
          ? Math.round(
              feedbackSeconds.reduce((sum, value) => sum + value, 0) /
                feedbackSeconds.length,
            )
          : null,
      },
      explanations: explanationOutcomes,
      synchronization: {
        total: jobs.length,
        completed: completedJobs.length,
        failed: jobs.filter((job) => job.status === "failed").length,
        noChange: jobs.filter((job) => job.stage === "no_change").length,
        successRate: jobs.length
          ? Math.round((completedJobs.length / jobs.length) * 100)
          : null,
      },
      export: feedback.map((item) => ({
        reportId: item.reportId,
        rating: item.rating,
        confirmedFindingCount: item.confirmedFindingIds.length,
        hasMissedImpact: Boolean(item.missedImpact),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }

  async purgeExpiredPilotFeedback(
    workspaceId: string,
    cutoff: Date,
    actorUserId: string,
  ) {
    return this.database.client.transaction(async (transaction) => {
      const deleted = await transaction
        .delete(impactReportFeedback)
        .where(
          and(
            eq(impactReportFeedback.workspaceId, workspaceId),
            lt(impactReportFeedback.updatedAt, cutoff),
          ),
        )
        .returning({ id: impactReportFeedback.id });
      await transaction.insert(auditEvents).values({
        workspaceId,
        actorUserId,
        action: "pilot.feedback.retention_applied",
        targetType: "workspace",
        targetId: workspaceId,
        metadata: { deletedCount: deleted.length, cutoff: cutoff.toISOString() },
      });
      return { deletedCount: deleted.length, cutoff: cutoff.toISOString() };
    });
  }

  private slugify(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48) || "workspace"
    );
  }
}
