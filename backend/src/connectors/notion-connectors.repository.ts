import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import {
  auditEvents,
  connectors,
  notionResources,
} from "../database/schema";
import type {
  AccessibleNotionResource,
  NotionOAuthToken,
} from "./notion-api.service";

@Injectable()
export class NotionConnectorsRepository {
  constructor(private readonly database: DatabaseService) {}

  async install(
    workspaceId: string,
    actorUserId: string,
    token: NotionOAuthToken,
    encryptedCredentials: string,
    resources: AccessibleNotionResource[],
  ) {
    return this.database.client.transaction(async (transaction) => {
      const [inserted] = await transaction
        .insert(connectors)
        .values({
          workspaceId,
          provider: "notion",
          status: "active",
          providerInstallationId: token.bot_id,
          encryptedCredentials,
          configuration: {
            workspaceId: token.workspace_id,
            workspaceName: token.workspace_name,
            workspaceIcon: token.workspace_icon,
            botId: token.bot_id,
          },
        })
        .onConflictDoNothing()
        .returning();

      let connector = inserted;
      if (!connector) {
        const [existing] = await transaction
          .select()
          .from(connectors)
          .where(
            and(
              eq(connectors.provider, "notion"),
              eq(connectors.providerInstallationId, token.bot_id),
            ),
          )
          .limit(1);
        if (!existing || existing.workspaceId !== workspaceId) {
          throw new ConflictException(
            "This Notion connection is already linked to another workspace.",
          );
        }
        [connector] = await transaction
          .update(connectors)
          .set({
            status: "active",
            encryptedCredentials,
            configuration: {
              workspaceId: token.workspace_id,
              workspaceName: token.workspace_name,
              workspaceIcon: token.workspace_icon,
              botId: token.bot_id,
            },
            updatedAt: new Date(),
          })
          .where(eq(connectors.id, existing.id))
          .returning();
      }
      if (!connector) throw new Error("Notion connector was not persisted.");

      await this.replaceResources(
        transaction,
        workspaceId,
        connector.id,
        resources,
      );
      await transaction.insert(auditEvents).values({
        workspaceId,
        actorUserId,
        action: "connector.notion.installed",
        targetType: "connector",
        targetId: connector.id,
        metadata: { resourceCount: resources.length },
      });
      return connector;
    });
  }

  list(workspaceId: string) {
    return this.database.client
      .select({
        id: connectors.id,
        status: connectors.status,
        configuration: connectors.configuration,
        createdAt: connectors.createdAt,
        updatedAt: connectors.updatedAt,
      })
      .from(connectors)
      .where(
        and(
          eq(connectors.workspaceId, workspaceId),
          eq(connectors.provider, "notion"),
        ),
      );
  }

  listResources(workspaceId: string) {
    return this.database.client
      .select({
        id: notionResources.id,
        connectorId: notionResources.connectorId,
        providerResourceId: notionResources.providerResourceId,
        kind: notionResources.kind,
        title: notionResources.title,
        url: notionResources.url,
        parentId: notionResources.parentId,
        isSelected: notionResources.isSelected,
        isActive: notionResources.isActive,
        lastEditedAt: notionResources.lastEditedAt,
        lastSyncedAt: notionResources.lastSyncedAt,
      })
      .from(notionResources)
      .where(eq(notionResources.workspaceId, workspaceId));
  }

  async updateSelection(
    workspaceId: string,
    resourceIds: string[],
    actorUserId: string,
  ) {
    const connector = await this.findActive(workspaceId);
    if (!connector) throw new NotFoundException("Active Notion connector not found.");

    if (resourceIds.length) {
      const selected = await this.database.client
        .select({ id: notionResources.id })
        .from(notionResources)
        .where(
          and(
            eq(notionResources.workspaceId, workspaceId),
            eq(notionResources.connectorId, connector.id),
            eq(notionResources.isActive, true),
            inArray(notionResources.id, resourceIds),
          ),
        );
      if (selected.length !== new Set(resourceIds).size) {
        throw new NotFoundException(
          "One or more active Notion resources were not found.",
        );
      }
    }

    await this.database.client.transaction(async (transaction) => {
      await transaction
        .update(notionResources)
        .set({ isSelected: false, updatedAt: new Date() })
        .where(eq(notionResources.connectorId, connector.id));
      if (resourceIds.length) {
        await transaction
          .update(notionResources)
          .set({ isSelected: true, updatedAt: new Date() })
          .where(
            and(
              eq(notionResources.connectorId, connector.id),
              inArray(notionResources.id, resourceIds),
            ),
          );
      }
      await transaction.insert(auditEvents).values({
        workspaceId,
        actorUserId,
        action: "connector.notion.selection_updated",
        targetType: "connector",
        targetId: connector.id,
        metadata: { selectedResourceCount: resourceIds.length },
      });
    });
  }

  async revoke(workspaceId: string, actorUserId: string) {
    const connector = await this.findActive(workspaceId);
    if (!connector) throw new NotFoundException("Active Notion connector not found.");
    await this.database.client.transaction(async (transaction) => {
      await transaction
        .update(connectors)
        .set({
          status: "revoked",
          encryptedCredentials: null,
          updatedAt: new Date(),
        })
        .where(eq(connectors.id, connector.id));
      await transaction
        .update(notionResources)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(notionResources.connectorId, connector.id));
      await transaction.insert(auditEvents).values({
        workspaceId,
        actorUserId,
        action: "connector.notion.revoked",
        targetType: "connector",
        targetId: connector.id,
      });
    });
  }

  private async findActive(workspaceId: string) {
    const [connector] = await this.database.client
      .select()
      .from(connectors)
      .where(
        and(
          eq(connectors.workspaceId, workspaceId),
          eq(connectors.provider, "notion"),
          eq(connectors.status, "active"),
        ),
      )
      .limit(1);
    return connector ?? null;
  }

  private async replaceResources(
    transaction: Parameters<
      Parameters<DatabaseService["client"]["transaction"]>[0]
    >[0],
    workspaceId: string,
    connectorId: string,
    resources: AccessibleNotionResource[],
  ) {
    await transaction
      .update(notionResources)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(notionResources.connectorId, connectorId));

    for (const resource of resources) {
      await transaction
        .insert(notionResources)
        .values({ workspaceId, connectorId, ...resource })
        .onConflictDoUpdate({
          target: [
            notionResources.connectorId,
            notionResources.providerResourceId,
          ],
          set: {
            kind: resource.kind,
            title: resource.title,
            url: resource.url,
            parentId: resource.parentId,
            isActive: true,
            lastEditedAt: resource.lastEditedAt,
            updatedAt: new Date(),
          },
        });
    }
  }
}
