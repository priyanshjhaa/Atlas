import { Injectable } from "@nestjs/common";
import { and, eq, gt } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import {
  sessions,
  users,
  workspaceMembers,
  workspaces,
} from "../database/schema";
import type {
  AuthenticatedIdentity,
  WorkspaceAccess,
} from "./auth.types";

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseService) {}

  async findActiveSession(
    sessionId: string,
    userId: string,
    now = new Date(),
  ): Promise<AuthenticatedIdentity | null> {
    const [result] = await this.database.client
      .select({
        sessionId: sessions.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.userId, userId),
          gt(sessions.expiresAt, now),
        ),
      )
      .limit(1);

    if (!result) return null;

    return {
      sessionId: result.sessionId,
      user: {
        id: result.userId,
        name: result.name,
        email: result.email,
        image: result.image,
      },
    };
  }

  listWorkspaces(userId: string): Promise<WorkspaceAccess[]> {
    return this.database.client
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId));
  }

  async findWorkspaceAccess(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceAccess | null> {
    const [workspace] = await this.database.client
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    return workspace ?? null;
  }
}
