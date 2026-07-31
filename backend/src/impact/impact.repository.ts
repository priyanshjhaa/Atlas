import { Injectable } from "@nestjs/common";
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  or,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DatabaseService } from "../database/database.service";
import {
  auditEvents,
  codeFiles,
  codeRelationships,
  codeSymbols,
  connectors,
  impactReports,
  repositories,
} from "../database/schema";
import { explanationAuditEvent } from "./explanation-audit";
import type { ImpactExplanationState } from "./explanation.types";
import type {
  ImpactReportInput,
  ImpactReportResult,
  StoredImpactReport,
} from "./impact.types";

const sourceFiles = alias(codeFiles, "impact_source_files");
const targetFiles = alias(codeFiles, "impact_target_files");

export interface ImpactRepositoryDetails {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string | null;
  lastSyncedRevision: string | null;
  installationId: string | null;
}

export interface ImpactFileCandidate {
  id: string;
  path: string;
  language: string;
  sourceRevision: string;
}

export interface ImpactSymbolCandidate {
  id: string;
  fileId: string;
  filePath: string;
  name: string;
  kind: string;
  lineStart: number;
  lineEnd: number;
  exported: boolean;
}

export interface ImpactRelationshipCandidate {
  id: string;
  sourceFileId: string;
  sourcePath: string;
  targetFileId: string;
  targetPath: string;
  kind: string;
  provenance: string;
  confidence: number;
  sourceRevision: string;
  evidence: Record<string, unknown>;
}

@Injectable()
export class ImpactRepository {
  constructor(private readonly database: DatabaseService) {}

  async repositoryDetails(
    workspaceId: string,
    repositoryId: string,
  ): Promise<ImpactRepositoryDetails | null> {
    const [repository] = await this.database.client
      .select({
        id: repositories.id,
        owner: repositories.owner,
        name: repositories.name,
        defaultBranch: repositories.defaultBranch,
        lastSyncedRevision: repositories.lastSyncedRevision,
        installationId: connectors.providerInstallationId,
      })
      .from(repositories)
      .leftJoin(connectors, eq(connectors.id, repositories.connectorId))
      .where(
        and(
          eq(repositories.workspaceId, workspaceId),
          eq(repositories.id, repositoryId),
          eq(repositories.isActive, true),
        ),
      )
      .limit(1);
    return repository ?? null;
  }

  async filesByPaths(
    workspaceId: string,
    repositoryId: string,
    paths: string[],
  ): Promise<ImpactFileCandidate[]> {
    if (!paths.length) return [];
    return this.database.client
      .select({
        id: codeFiles.id,
        path: codeFiles.path,
        language: codeFiles.language,
        sourceRevision: codeFiles.sourceRevision,
      })
      .from(codeFiles)
      .where(
        and(
          eq(codeFiles.workspaceId, workspaceId),
          eq(codeFiles.repositoryId, repositoryId),
          inArray(codeFiles.path, paths),
        ),
      );
  }

  async matchingSymbols(
    workspaceId: string,
    repositoryId: string,
    terms: string[],
    preferredFileIds: string[],
  ): Promise<ImpactSymbolCandidate[]> {
    const termFilters = terms.flatMap((term) => [
      ilike(codeSymbols.name, `%${term}%`),
      ilike(codeSymbols.stableKey, `%${term}%`),
      ilike(codeFiles.path, `%${term}%`),
    ]);
    const candidateFilter =
      preferredFileIds.length && termFilters.length
        ? or(inArray(codeSymbols.fileId, preferredFileIds), ...termFilters)
        : preferredFileIds.length
          ? inArray(codeSymbols.fileId, preferredFileIds)
          : termFilters.length
            ? or(...termFilters)
            : undefined;

    if (!candidateFilter) return [];
    return this.database.client
      .select({
        id: codeSymbols.id,
        fileId: codeSymbols.fileId,
        filePath: codeFiles.path,
        name: codeSymbols.name,
        kind: codeSymbols.kind,
        lineStart: codeSymbols.lineStart,
        lineEnd: codeSymbols.lineEnd,
        exported: codeSymbols.exported,
      })
      .from(codeSymbols)
      .innerJoin(codeFiles, eq(codeFiles.id, codeSymbols.fileId))
      .where(
        and(
          eq(codeSymbols.workspaceId, workspaceId),
          eq(codeSymbols.repositoryId, repositoryId),
          candidateFilter,
        ),
      )
      .orderBy(desc(codeSymbols.exported), codeSymbols.name)
      .limit(16);
  }

  async incomingRelationships(
    workspaceId: string,
    repositoryId: string,
    targetFileIds: string[],
  ): Promise<ImpactRelationshipCandidate[]> {
    if (!targetFileIds.length) return [];
    return this.database.client
      .select({
        id: codeRelationships.id,
        sourceFileId: codeRelationships.sourceFileId,
        sourcePath: sourceFiles.path,
        targetFileId: codeRelationships.targetFileId,
        targetPath: targetFiles.path,
        kind: codeRelationships.kind,
        provenance: codeRelationships.provenance,
        confidence: codeRelationships.confidence,
        sourceRevision: codeRelationships.sourceRevision,
        evidence: codeRelationships.evidence,
      })
      .from(codeRelationships)
      .innerJoin(sourceFiles, eq(sourceFiles.id, codeRelationships.sourceFileId))
      .innerJoin(targetFiles, eq(targetFiles.id, codeRelationships.targetFileId))
      .where(
        and(
          eq(codeRelationships.workspaceId, workspaceId),
          eq(codeRelationships.repositoryId, repositoryId),
          inArray(codeRelationships.targetFileId, targetFileIds),
        ),
      )
      .limit(100);
  }

  async create(input: {
    workspaceId: string;
    repositoryId: string;
    requestedByUserId: string;
    sourceRevision: string;
    request: ImpactReportInput;
    result: ImpactReportResult;
  }): Promise<StoredImpactReport> {
    const [created] = await this.database.client
      .insert(impactReports)
      .values({
        workspaceId: input.workspaceId,
        repositoryId: input.repositoryId,
        requestedByUserId: input.requestedByUserId,
        sourceRevision: input.sourceRevision,
        input: input.request as unknown as Record<string, unknown>,
        result: input.result as unknown as Record<string, unknown>,
      })
      .returning();
    if (!created) throw new Error("Impact report was not persisted.");
    return created as unknown as StoredImpactReport;
  }

  async findById(
    workspaceId: string,
    reportId: string,
  ): Promise<StoredImpactReport | null> {
    const [report] = await this.database.client
      .select()
      .from(impactReports)
      .where(
        and(
          eq(impactReports.workspaceId, workspaceId),
          eq(impactReports.id, reportId),
        ),
      )
      .limit(1);
    return (report as unknown as StoredImpactReport | undefined) ?? null;
  }

  async updateExplanation(
    workspaceId: string,
    reportId: string,
    explanation: ImpactExplanationState,
    actorUserId: string | null,
  ): Promise<StoredImpactReport | null> {
    return this.database.client.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(impactReports)
        .set({
          explanation,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(impactReports.workspaceId, workspaceId),
            eq(impactReports.id, reportId),
          ),
        )
        .returning();

      const audit = explanationAuditEvent(explanation);
      if (updated && audit) {
        await transaction.insert(auditEvents).values({
          workspaceId,
          actorUserId,
          action: audit.action,
          targetType: "impact_report",
          targetId: reportId,
          metadata: audit.metadata,
        });
      }
      return (updated as unknown as StoredImpactReport | undefined) ?? null;
    });
  }
}
