import { ConflictException, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import {
  auditEvents,
  connectors,
  githubWebhookDeliveries,
  repositories,
} from "../database/schema";
import type {
  GitHubInstallation,
  GitHubRepository,
} from "./github-app.service";

@Injectable()
export class GitHubConnectorsRepository {
  constructor(private readonly database: DatabaseService) {}

  async install(
    workspaceId: string,
    actorUserId: string,
    installation: GitHubInstallation,
    encryptedSnapshot: string,
    selectedRepositories: GitHubRepository[],
  ) {
    return this.database.client.transaction(async (transaction) => {
      const [insertedConnector] = await transaction
        .insert(connectors)
        .values({
          workspaceId,
          provider: "github",
          status: "active",
          providerInstallationId: String(installation.id),
          encryptedCredentials: encryptedSnapshot,
          configuration: {
            account: installation.account.login,
            accountType: installation.account.type,
            repositorySelection: installation.repository_selection,
          },
        })
        .onConflictDoNothing()
        .returning();

      let connector = insertedConnector;
      if (!connector) {
        const [existingConnector] = await transaction
          .select()
          .from(connectors)
          .where(
            and(
              eq(connectors.provider, "github"),
              eq(
                connectors.providerInstallationId,
                String(installation.id),
              ),
            ),
          )
          .limit(1);

        if (!existingConnector || existingConnector.workspaceId !== workspaceId) {
          throw new ConflictException(
            "This GitHub installation is already connected to another workspace.",
          );
        }

        const [updatedConnector] = await transaction
          .update(connectors)
          .set({
            status: "active",
            encryptedCredentials: encryptedSnapshot,
            configuration: {
              account: installation.account.login,
              accountType: installation.account.type,
              repositorySelection: installation.repository_selection,
            },
            updatedAt: new Date(),
          })
          .where(eq(connectors.id, existingConnector.id))
          .returning();
        connector = updatedConnector;
      }

      if (!connector) throw new Error("GitHub connector was not persisted.");
      await this.replaceRepositories(
        transaction,
        workspaceId,
        connector.id,
        selectedRepositories,
      );
      await transaction.insert(auditEvents).values({
        workspaceId,
        actorUserId,
        action: "connector.github.installed",
        targetType: "connector",
        targetId: connector.id,
        metadata: {
          installationId: String(installation.id),
          repositoryCount: selectedRepositories.length,
        },
      });
      return connector;
    });
  }

  list(workspaceId: string) {
    return this.database.client
      .select({
        id: connectors.id,
        status: connectors.status,
        installationId: connectors.providerInstallationId,
        configuration: connectors.configuration,
        createdAt: connectors.createdAt,
        updatedAt: connectors.updatedAt,
      })
      .from(connectors)
      .where(
        and(
          eq(connectors.workspaceId, workspaceId),
          eq(connectors.provider, "github"),
        ),
      );
  }

  async claimDelivery(id: string, event: string): Promise<boolean> {
    const rows = await this.database.client
      .insert(githubWebhookDeliveries)
      .values({ id, event })
      .onConflictDoNothing()
      .returning({ id: githubWebhookDeliveries.id });
    return rows.length === 1;
  }

  async findByInstallationId(installationId: string) {
    const [connector] = await this.database.client
      .select()
      .from(connectors)
      .where(
        and(
          eq(connectors.provider, "github"),
          eq(connectors.providerInstallationId, installationId),
        ),
      )
      .limit(1);
    return connector ?? null;
  }

  async syncRepositories(
    connector: typeof connectors.$inferSelect,
    selectedRepositories: GitHubRepository[],
  ): Promise<void> {
    await this.database.client.transaction(async (transaction) => {
      await this.replaceRepositories(
        transaction,
        connector.workspaceId,
        connector.id,
        selectedRepositories,
      );
      await transaction.insert(auditEvents).values({
        workspaceId: connector.workspaceId,
        action: "connector.github.repositories_updated",
        targetType: "connector",
        targetId: connector.id,
        metadata: { repositoryCount: selectedRepositories.length },
      });
    });
  }

  async revoke(connector: typeof connectors.$inferSelect): Promise<void> {
    await this.database.client.transaction(async (transaction) => {
      await transaction
        .update(connectors)
        .set({ status: "revoked", encryptedCredentials: null, updatedAt: new Date() })
        .where(eq(connectors.id, connector.id));
      await transaction
        .update(repositories)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(repositories.connectorId, connector.id));
      await transaction.insert(auditEvents).values({
        workspaceId: connector.workspaceId,
        action: "connector.github.revoked",
        targetType: "connector",
        targetId: connector.id,
      });
    });
  }

  private async replaceRepositories(
    transaction: Parameters<
      Parameters<DatabaseService["client"]["transaction"]>[0]
    >[0],
    workspaceId: string,
    connectorId: string,
    selectedRepositories: GitHubRepository[],
  ): Promise<void> {
    await transaction
      .update(repositories)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(repositories.connectorId, connectorId));

    for (const repository of selectedRepositories) {
      await transaction
        .insert(repositories)
        .values({
          workspaceId,
          connectorId,
          providerRepositoryId: String(repository.id),
          owner: repository.owner.login,
          name: repository.name,
          defaultBranch: repository.default_branch,
          isPrivate: repository.private,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [
            repositories.workspaceId,
            repositories.providerRepositoryId,
          ],
          set: {
            connectorId,
            owner: repository.owner.login,
            name: repository.name,
            defaultBranch: repository.default_branch,
            isPrivate: repository.private,
            isActive: true,
            updatedAt: new Date(),
          },
        });
    }
  }
}
