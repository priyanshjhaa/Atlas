import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DatabaseService } from "./database.service";
import { repositories, type Repository } from "./schema";
import {
  parseWorkspaceId,
  withinWorkspace,
  type WorkspaceId,
} from "./workspace-scope";

@Injectable()
export class RepositoriesRepository {
  constructor(private readonly database: DatabaseService) {}

  list(workspaceId: WorkspaceId): Promise<Repository[]> {
    return this.database.client
      .select()
      .from(repositories)
      .where(withinWorkspace(repositories.workspaceId, workspaceId));
  }

  async findById(
    workspaceId: WorkspaceId,
    repositoryId: string,
  ): Promise<Repository | null> {
    const [repository] = await this.database.client
      .select()
      .from(repositories)
      .where(
        and(
          withinWorkspace(repositories.workspaceId, workspaceId),
          eq(repositories.id, repositoryId),
        ),
      )
      .limit(1);

    return repository ?? null;
  }

  listForUntrustedWorkspace(workspaceId: string): Promise<Repository[]> {
    return this.list(parseWorkspaceId(workspaceId));
  }
}
