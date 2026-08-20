import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  lte,
  max,
  ne,
  sql,
} from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import {
  auditEvents,
  connectors,
  notionContextBriefings,
  notionDocumentReviews,
  notionDocuments,
  notionDocumentVersions,
  notionResources,
  workspaceNotionCursors,
} from "../database/schema";

export interface EligibleNotionReviewDocument {
  documentId: string;
  resourceId: string;
  title: string;
  url: string | null;
  lastSyncedAt: Date | null;
  versions: Array<{
    id: string;
    sourceRevision: string;
    capturedAt: Date;
    truncated: boolean;
  }>;
}

export interface NotionReviewInput {
  documentId: string;
  resourceId: string;
  title: string;
  url: string | null;
  current: {
    id: string;
    sourceRevision: string;
    contentHash: string;
    content: string;
    truncated: boolean;
    capturedAt: Date;
  };
  previous: {
    id: string;
    sourceRevision: string;
    contentHash: string;
    content: string;
    truncated: boolean;
    capturedAt: Date;
  };
  relatedDocuments: Array<{
    documentId: string;
    resourceId: string;
    title: string;
    url: string | null;
    sourceRevision: string;
    content: string;
    capturedAt: Date;
  }>;
}

export interface EligibleNotionDocumentChange {
  documentId: string;
  documentCreatedAt: Date;
  resourceId: string;
  title: string;
  url: string | null;
  lastEditedAt: Date | null;
  lastSyncedAt: Date | null;
  latestChangeAt: Date;
  versions: Array<{
    id: string;
    contentHash: string;
    sourceRevision: string;
    content: string;
    citation: Record<string, unknown>;
    truncated: boolean;
    capturedAt: Date;
  }>;
}

@Injectable()
export class NotionContextRepository {
  constructor(private readonly database: DatabaseService) {}

  async getCursor(workspaceId: string, userId: string) {
    const [cursor] = await this.database.client
      .select({
        id: workspaceNotionCursors.id,
        acknowledgedThrough: workspaceNotionCursors.acknowledgedThrough,
      })
      .from(workspaceNotionCursors)
      .where(
        and(
          eq(workspaceNotionCursors.workspaceId, workspaceId),
          eq(workspaceNotionCursors.userId, userId),
        ),
      )
      .limit(1);
    return cursor ?? null;
  }

  async getAvailability(workspaceId: string) {
    const [[connector], [resource]] = await Promise.all([
      this.database.client
        .select({ value: count() })
        .from(connectors)
        .where(
          and(
            eq(connectors.workspaceId, workspaceId),
            eq(connectors.provider, "notion"),
            eq(connectors.status, "active"),
          ),
        ),
      this.database.client
        .select({ value: count() })
        .from(notionResources)
        .innerJoin(connectors, eq(connectors.id, notionResources.connectorId))
        .where(
          and(
            eq(notionResources.workspaceId, workspaceId),
            eq(notionResources.isSelected, true),
            eq(notionResources.isActive, true),
            eq(connectors.workspaceId, workspaceId),
            eq(connectors.provider, "notion"),
            eq(connectors.status, "active"),
          ),
        ),
    ]);
    return {
      connected: Number(connector?.value ?? 0) > 0,
      selectedResources: Number(resource?.value ?? 0),
    };
  }

  async listReviewDocuments(
    workspaceId: string,
  ): Promise<EligibleNotionReviewDocument[]> {
    const rows = await this.database.client
      .select({
        documentId: notionDocuments.id,
        resourceId: notionResources.id,
        title: notionDocuments.title,
        url: notionResources.url,
        lastSyncedAt: notionResources.lastSyncedAt,
        versionId: notionDocumentVersions.id,
        sourceRevision: notionDocumentVersions.sourceRevision,
        capturedAt: notionDocumentVersions.capturedAt,
        truncated: notionDocumentVersions.truncated,
      })
      .from(notionDocuments)
      .innerJoin(
        notionResources,
        eq(notionResources.id, notionDocuments.resourceId),
      )
      .innerJoin(connectors, eq(connectors.id, notionDocuments.connectorId))
      .innerJoin(
        notionDocumentVersions,
        eq(notionDocumentVersions.documentId, notionDocuments.id),
      )
      .where(
        and(
          eq(notionDocuments.workspaceId, workspaceId),
          eq(notionResources.workspaceId, workspaceId),
          eq(notionDocumentVersions.workspaceId, workspaceId),
          eq(connectors.workspaceId, workspaceId),
          eq(connectors.provider, "notion"),
          eq(connectors.status, "active"),
          eq(notionResources.isSelected, true),
          eq(notionResources.isActive, true),
        ),
      )
      .orderBy(asc(notionDocuments.title), desc(notionDocumentVersions.capturedAt))
      .limit(5_000);
    const documents = new Map<string, EligibleNotionReviewDocument>();
    for (const row of rows) {
      const document = documents.get(row.documentId) ?? {
        documentId: row.documentId,
        resourceId: row.resourceId,
        title: row.title,
        url: row.url,
        lastSyncedAt: row.lastSyncedAt,
        versions: [],
      };
      document.versions.push({
        id: row.versionId,
        sourceRevision: row.sourceRevision,
        capturedAt: row.capturedAt,
        truncated: row.truncated,
      });
      documents.set(row.documentId, document);
    }
    return [...documents.values()];
  }

  async getReviewInput(
    workspaceId: string,
    documentId: string,
    previousVersionId: string,
  ): Promise<NotionReviewInput | null> {
    const [document] = await this.database.client
      .select({
        documentId: notionDocuments.id,
        resourceId: notionResources.id,
        title: notionDocuments.title,
        url: notionResources.url,
      })
      .from(notionDocuments)
      .innerJoin(
        notionResources,
        eq(notionResources.id, notionDocuments.resourceId),
      )
      .innerJoin(connectors, eq(connectors.id, notionDocuments.connectorId))
      .where(
        and(
          eq(notionDocuments.id, documentId),
          eq(notionDocuments.workspaceId, workspaceId),
          eq(notionResources.workspaceId, workspaceId),
          eq(connectors.workspaceId, workspaceId),
          eq(connectors.provider, "notion"),
          eq(connectors.status, "active"),
          eq(notionResources.isSelected, true),
          eq(notionResources.isActive, true),
        ),
      )
      .limit(1);
    if (!document) return null;
    const versions = await this.database.client
      .select({
        id: notionDocumentVersions.id,
        sourceRevision: notionDocumentVersions.sourceRevision,
        contentHash: notionDocumentVersions.contentHash,
        content: notionDocumentVersions.content,
        truncated: notionDocumentVersions.truncated,
        capturedAt: notionDocumentVersions.capturedAt,
      })
      .from(notionDocumentVersions)
      .where(
        and(
          eq(notionDocumentVersions.workspaceId, workspaceId),
          eq(notionDocumentVersions.documentId, documentId),
        ),
      )
      .orderBy(desc(notionDocumentVersions.capturedAt));
    const current = versions[0];
    const previous = versions.find((version) => version.id === previousVersionId);
    if (!current || !previous || current.id === previous.id) return null;
    const relatedDocuments = await this.database.client
      .select({
        documentId: notionDocuments.id,
        resourceId: notionResources.id,
        title: notionDocuments.title,
        url: notionResources.url,
        sourceRevision: notionDocuments.sourceRevision,
        content: notionDocuments.content,
        capturedAt: notionDocuments.syncedAt,
      })
      .from(notionDocuments)
      .innerJoin(
        notionResources,
        eq(notionResources.id, notionDocuments.resourceId),
      )
      .innerJoin(connectors, eq(connectors.id, notionDocuments.connectorId))
      .where(
        and(
          eq(notionDocuments.workspaceId, workspaceId),
          ne(notionDocuments.id, documentId),
          eq(notionResources.workspaceId, workspaceId),
          eq(connectors.workspaceId, workspaceId),
          eq(connectors.provider, "notion"),
          eq(connectors.status, "active"),
          eq(notionResources.isSelected, true),
          eq(notionResources.isActive, true),
        ),
      )
      .orderBy(desc(notionDocuments.syncedAt))
      .limit(8);
    return { ...document, current, previous, relatedDocuments };
  }

  async findReview(input: {
    workspaceId: string;
    documentId: string;
    currentRevision: string;
    previousRevision: string;
    evidenceHash: string;
  }) {
    const [review] = await this.database.client
      .select()
      .from(notionDocumentReviews)
      .where(
        and(
          eq(notionDocumentReviews.workspaceId, input.workspaceId),
          eq(notionDocumentReviews.documentId, input.documentId),
          eq(notionDocumentReviews.currentRevision, input.currentRevision),
          eq(notionDocumentReviews.previousRevision, input.previousRevision),
          eq(notionDocumentReviews.evidenceHash, input.evidenceHash),
        ),
      )
      .limit(1);
    return review ?? null;
  }

  async saveReview(input: {
    workspaceId: string;
    requestedByUserId: string;
    documentId: string;
    currentVersionId: string;
    previousVersionId: string;
    documentTitle: string;
    documentUrl: string | null;
    currentRevision: string;
    previousRevision: string;
    currentCapturedAt: Date;
    previousCapturedAt: Date;
    evidenceHash: string;
    generationStatus: "generated" | "fallback";
    result: Record<string, unknown>;
  }) {
    const [created] = await this.database.client
      .insert(notionDocumentReviews)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return created ?? this.findReview(input);
  }

  async getReview(workspaceId: string, reviewId: string) {
    const [review] = await this.database.client
      .select()
      .from(notionDocumentReviews)
      .where(
        and(
          eq(notionDocumentReviews.workspaceId, workspaceId),
          eq(notionDocumentReviews.id, reviewId),
        ),
      )
      .limit(1);
    return review ?? null;
  }

  async listReviews(workspaceId: string, limit = 20) {
    return this.database.client
      .select()
      .from(notionDocumentReviews)
      .where(eq(notionDocumentReviews.workspaceId, workspaceId))
      .orderBy(desc(notionDocumentReviews.createdAt))
      .limit(limit);
  }

  async listEligibleChanges(
    workspaceId: string,
    rangeStart: Date,
    rangeEnd: Date,
    limit: number,
  ): Promise<{ documents: EligibleNotionDocumentChange[]; truncated: boolean }> {
    const latestChange = max(notionDocumentVersions.capturedAt);
    const changed = await this.database.client
      .select({
        documentId: notionDocuments.id,
        documentCreatedAt: notionDocuments.createdAt,
        resourceId: notionResources.id,
        title: notionDocuments.title,
        url: notionResources.url,
        lastEditedAt: notionResources.lastEditedAt,
        lastSyncedAt: notionResources.lastSyncedAt,
        latestChangeAt: latestChange,
      })
      .from(notionDocumentVersions)
      .innerJoin(
        notionDocuments,
        eq(notionDocuments.id, notionDocumentVersions.documentId),
      )
      .innerJoin(
        notionResources,
        eq(notionResources.id, notionDocuments.resourceId),
      )
      .innerJoin(connectors, eq(connectors.id, notionDocuments.connectorId))
      .where(
        and(
          eq(notionDocumentVersions.workspaceId, workspaceId),
          eq(notionDocuments.workspaceId, workspaceId),
          eq(notionResources.workspaceId, workspaceId),
          eq(connectors.workspaceId, workspaceId),
          eq(connectors.provider, "notion"),
          eq(connectors.status, "active"),
          eq(notionResources.isSelected, true),
          eq(notionResources.isActive, true),
          gt(notionDocumentVersions.capturedAt, rangeStart),
          lte(notionDocumentVersions.capturedAt, rangeEnd),
        ),
      )
      .groupBy(
        notionDocuments.id,
        notionDocuments.createdAt,
        notionResources.id,
        notionDocuments.title,
        notionResources.url,
        notionResources.lastEditedAt,
        notionResources.lastSyncedAt,
      )
      .orderBy(desc(latestChange))
      .limit(limit + 1);

    const selected = changed.slice(0, limit).filter(
      (item): item is typeof item & { latestChangeAt: Date } =>
        item.latestChangeAt instanceof Date,
    );
    if (!selected.length) {
      return { documents: [], truncated: changed.length > limit };
    }

    const versions = await this.database.client
      .select({
        id: notionDocumentVersions.id,
        documentId: notionDocumentVersions.documentId,
        contentHash: notionDocumentVersions.contentHash,
        sourceRevision: notionDocumentVersions.sourceRevision,
        content: notionDocumentVersions.content,
        citation: notionDocumentVersions.citation,
        truncated: notionDocumentVersions.truncated,
        capturedAt: notionDocumentVersions.capturedAt,
      })
      .from(notionDocumentVersions)
      .where(
        and(
          eq(notionDocumentVersions.workspaceId, workspaceId),
          inArray(
            notionDocumentVersions.documentId,
            selected.map((item) => item.documentId),
          ),
          lte(notionDocumentVersions.capturedAt, rangeEnd),
        ),
      )
      .orderBy(asc(notionDocumentVersions.capturedAt));

    const byDocument = new Map<string, typeof versions>();
    for (const version of versions) {
      const current = byDocument.get(version.documentId) ?? [];
      current.push(version);
      byDocument.set(version.documentId, current);
    }
    return {
      documents: selected.map((document) => ({
        ...document,
        versions: (byDocument.get(document.documentId) ?? []).map((version) => ({
          id: version.id,
          contentHash: version.contentHash,
          sourceRevision: version.sourceRevision,
          content: version.content,
          citation: version.citation,
          truncated: version.truncated,
          capturedAt: version.capturedAt,
        })),
      })),
      truncated: changed.length > limit,
    };
  }

  async findBriefing(input: {
    workspaceId: string;
    userId: string;
    rangeStart: Date;
    rangeEnd: Date;
    evidenceHash: string;
  }) {
    const [briefing] = await this.database.client
      .select()
      .from(notionContextBriefings)
      .where(
        and(
          eq(notionContextBriefings.workspaceId, input.workspaceId),
          eq(notionContextBriefings.userId, input.userId),
          eq(notionContextBriefings.rangeStart, input.rangeStart),
          eq(notionContextBriefings.rangeEnd, input.rangeEnd),
          eq(notionContextBriefings.evidenceHash, input.evidenceHash),
        ),
      )
      .limit(1);
    return briefing ?? null;
  }

  async saveBriefing(input: {
    workspaceId: string;
    userId: string;
    rangeStart: Date;
    rangeEnd: Date;
    evidenceHash: string;
    generationStatus: "generated" | "fallback";
    result: Record<string, unknown>;
  }) {
    const [created] = await this.database.client
      .insert(notionContextBriefings)
      .values(input)
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    return this.findBriefing(input);
  }

  async acknowledge(
    workspaceId: string,
    userId: string,
    acknowledgedThrough: Date,
  ) {
    return this.database.client.transaction(async (transaction) => {
      const [previous] = await transaction
        .select({
          acknowledgedThrough: workspaceNotionCursors.acknowledgedThrough,
        })
        .from(workspaceNotionCursors)
        .where(
          and(
            eq(workspaceNotionCursors.workspaceId, workspaceId),
            eq(workspaceNotionCursors.userId, userId),
          ),
        )
        .limit(1);
      const [cursor] = await transaction
        .insert(workspaceNotionCursors)
        .values({ workspaceId, userId, acknowledgedThrough })
        .onConflictDoUpdate({
          target: [
            workspaceNotionCursors.workspaceId,
            workspaceNotionCursors.userId,
          ],
          set: {
            acknowledgedThrough: sql`greatest(${workspaceNotionCursors.acknowledgedThrough}, excluded.acknowledged_through)`,
            updatedAt: new Date(),
          },
        })
        .returning();
      const advanced =
        !previous ||
        acknowledgedThrough.getTime() > previous.acknowledgedThrough.getTime();
      if (advanced) {
        await transaction.insert(auditEvents).values({
          workspaceId,
          actorUserId: userId,
          action: "notion_context.acknowledged",
          targetType: "workspace_notion_cursor",
          targetId: cursor?.id ?? null,
          metadata: {
            previousThrough: previous?.acknowledgedThrough.toISOString() ?? null,
            acknowledgedThrough: cursor?.acknowledgedThrough.toISOString(),
          },
        });
      }
      return { cursor, advanced };
    });
  }
}
