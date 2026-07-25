import { Injectable } from "@nestjs/common";
import { and, count, eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import {
  auditEvents,
  repositories,
  users,
  workspaceMembers,
  workspaces,
} from "../database/schema";
import type { WorkspaceRole } from "../auth/auth.types";

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  repositoryCount: number;
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
