import { Injectable } from "@nestjs/common";
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DatabaseService } from "../database/database.service";
import {
  auditEvents,
  codeFiles,
  codePackages,
  codeRelationships,
  codeSymbols,
  connectors,
  impactReportFeedback,
  impactReports,
  repositories,
  packageRelationships,
  relationshipObservations,
  symbolRelationships,
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
const workspaceSourceFiles = alias(codeFiles, "workspace_source_files");
const workspaceTargetFiles = alias(codeFiles, "workspace_target_files");
const workspaceTargetSymbols = alias(
  codeSymbols,
  "workspace_target_symbols",
);
const workspaceSourceRepositories = alias(
  repositories,
  "workspace_source_repositories",
);
const workspaceTargetRepositories = alias(
  repositories,
  "workspace_target_repositories",
);
const workspaceSourcePackages = alias(
  codePackages,
  "workspace_source_packages",
);
const workspaceTargetPackages = alias(
  codePackages,
  "workspace_target_packages",
);
const historicalSourceRepositories = alias(
  repositories,
  "historical_source_repositories",
);
const historicalTargetRepositories = alias(
  repositories,
  "historical_target_repositories",
);

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

export interface ImpactWorkspaceRelationshipCandidate {
  id: string;
  sourceRepositoryId: string;
  sourceRepository: string;
  sourceFileId: string | null;
  sourcePath: string;
  targetRepositoryId: string;
  targetRepository: string;
  targetPath: string;
  targetSymbol: string | null;
  kind: string;
  provenance:
    | "package_manifest_dependency"
    | "typescript_public_api_import"
    | "typescript_public_api_call";
  confidence: number;
  sourceRevision: string;
  targetRevision: string;
  evidence: Record<string, unknown>;
}

export interface ImpactHistoricalRelationshipCandidate {
  id: string;
  stableKey: string;
  sourceRepositoryId: string;
  sourceRepository: string;
  sourcePath: string;
  sourceEntityKind: string;
  targetRepositoryId: string;
  targetRepository: string;
  targetPath: string;
  targetSymbol: string | null;
  targetEntityKind: string;
  kind: string;
  originalProvenance: string;
  confidence: number;
  observedRevision: string;
  sourceRevision: string;
  targetRevision: string;
  observedAt: Date;
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

  async hasWorkspaceRelationshipIndex(workspaceId: string): Promise<boolean> {
    const [symbolRelationship] = await this.database.client
      .select({ id: symbolRelationships.id })
      .from(symbolRelationships)
      .innerJoin(
        workspaceSourceRepositories,
        eq(
          workspaceSourceRepositories.id,
          symbolRelationships.sourceRepositoryId,
        ),
      )
      .innerJoin(
        workspaceTargetRepositories,
        eq(
          workspaceTargetRepositories.id,
          symbolRelationships.targetRepositoryId,
        ),
      )
      .where(
        and(
          eq(symbolRelationships.workspaceId, workspaceId),
          eq(workspaceSourceRepositories.isActive, true),
          eq(workspaceTargetRepositories.isActive, true),
        ),
      )
      .limit(1);
    if (symbolRelationship) return true;
    const [packageRelationship] = await this.database.client
      .select({ id: packageRelationships.id })
      .from(packageRelationships)
      .innerJoin(
        workspaceSourceRepositories,
        eq(
          workspaceSourceRepositories.id,
          packageRelationships.sourceRepositoryId,
        ),
      )
      .innerJoin(
        workspaceTargetRepositories,
        eq(
          workspaceTargetRepositories.id,
          packageRelationships.targetRepositoryId,
        ),
      )
      .where(
        and(
          eq(packageRelationships.workspaceId, workspaceId),
          eq(workspaceSourceRepositories.isActive, true),
          eq(workspaceTargetRepositories.isActive, true),
        ),
      )
      .limit(1);
    if (packageRelationship) return true;
    const [historicalRelationship] = await this.database.client
      .select({ id: relationshipObservations.id })
      .from(relationshipObservations)
      .innerJoin(
        historicalSourceRepositories,
        eq(
          historicalSourceRepositories.id,
          relationshipObservations.sourceRepositoryId,
        ),
      )
      .innerJoin(
        historicalTargetRepositories,
        eq(
          historicalTargetRepositories.id,
          relationshipObservations.targetRepositoryId,
        ),
      )
      .where(
        and(
          eq(relationshipObservations.workspaceId, workspaceId),
          eq(historicalSourceRepositories.isActive, true),
          eq(historicalTargetRepositories.isActive, true),
        ),
      )
      .limit(1);
    return Boolean(historicalRelationship);
  }

  async incomingWorkspaceRelationships(
    workspaceId: string,
    repositoryId: string,
    targetSymbolIds: string[],
    targetFileIds: string[],
  ): Promise<ImpactWorkspaceRelationshipCandidate[]> {
    if (!targetSymbolIds.length && !targetFileIds.length) return [];
    const symbolRows = targetSymbolIds.length
      ? await this.database.client
          .select({
            id: symbolRelationships.id,
            sourceRepositoryId: symbolRelationships.sourceRepositoryId,
            sourceRepositoryOwner: workspaceSourceRepositories.owner,
            sourceRepositoryName: workspaceSourceRepositories.name,
            sourceFileId: symbolRelationships.sourceFileId,
            sourcePath: workspaceSourceFiles.path,
            targetRepositoryId: symbolRelationships.targetRepositoryId,
            targetRepositoryOwner: workspaceTargetRepositories.owner,
            targetRepositoryName: workspaceTargetRepositories.name,
            targetPath: workspaceTargetFiles.path,
            targetSymbol: workspaceTargetSymbols.name,
            kind: symbolRelationships.kind,
            provenance: symbolRelationships.provenance,
            confidence: symbolRelationships.confidence,
            sourceRevision: symbolRelationships.sourceRevision,
            targetRevision: symbolRelationships.targetRevision,
            evidence: symbolRelationships.evidence,
          })
          .from(symbolRelationships)
          .innerJoin(
            workspaceSourceRepositories,
            eq(
              workspaceSourceRepositories.id,
              symbolRelationships.sourceRepositoryId,
            ),
          )
          .innerJoin(
            workspaceTargetRepositories,
            eq(
              workspaceTargetRepositories.id,
              symbolRelationships.targetRepositoryId,
            ),
          )
          .innerJoin(
            workspaceSourceFiles,
            eq(workspaceSourceFiles.id, symbolRelationships.sourceFileId),
          )
          .innerJoin(
            workspaceTargetSymbols,
            eq(workspaceTargetSymbols.id, symbolRelationships.targetSymbolId),
          )
          .innerJoin(
            workspaceTargetFiles,
            eq(workspaceTargetFiles.id, workspaceTargetSymbols.fileId),
          )
          .where(
            and(
              eq(symbolRelationships.workspaceId, workspaceId),
              eq(symbolRelationships.targetRepositoryId, repositoryId),
              ne(symbolRelationships.sourceRepositoryId, repositoryId),
              inArray(symbolRelationships.targetSymbolId, targetSymbolIds),
              eq(workspaceSourceRepositories.isActive, true),
              eq(workspaceTargetRepositories.isActive, true),
            ),
          )
          .limit(100)
      : [];
    const packageSymbolFilter =
      targetSymbolIds.length && targetFileIds.length
        ? or(
            inArray(codeSymbols.id, targetSymbolIds),
            inArray(codeSymbols.fileId, targetFileIds),
          )
        : targetSymbolIds.length
          ? inArray(codeSymbols.id, targetSymbolIds)
          : inArray(codeSymbols.fileId, targetFileIds);
    const packageIds = [
      ...new Set(
        (
          await this.database.client
            .select({ packageId: codeSymbols.packageId })
            .from(codeSymbols)
            .where(
              and(
                eq(codeSymbols.workspaceId, workspaceId),
                eq(codeSymbols.repositoryId, repositoryId),
                packageSymbolFilter,
              ),
            )
        )
          .map((item) => item.packageId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const packageRows = packageIds.length
      ? await this.database.client
          .select({
            id: packageRelationships.id,
            sourceRepositoryId: packageRelationships.sourceRepositoryId,
            sourceRepositoryOwner: workspaceSourceRepositories.owner,
            sourceRepositoryName: workspaceSourceRepositories.name,
            sourcePath: workspaceSourcePackages.manifestPath,
            targetRepositoryId: packageRelationships.targetRepositoryId,
            targetRepositoryOwner: workspaceTargetRepositories.owner,
            targetRepositoryName: workspaceTargetRepositories.name,
            targetPath: workspaceTargetPackages.manifestPath,
            targetSymbol: workspaceTargetPackages.name,
            kind: packageRelationships.kind,
            provenance: packageRelationships.provenance,
            confidence: packageRelationships.confidence,
            sourceRevision: packageRelationships.sourceRevision,
            targetRevision: workspaceTargetPackages.sourceRevision,
            evidence: packageRelationships.evidence,
          })
          .from(packageRelationships)
          .innerJoin(
            workspaceSourceRepositories,
            eq(
              workspaceSourceRepositories.id,
              packageRelationships.sourceRepositoryId,
            ),
          )
          .innerJoin(
            workspaceTargetRepositories,
            eq(
              workspaceTargetRepositories.id,
              packageRelationships.targetRepositoryId,
            ),
          )
          .innerJoin(
            workspaceSourcePackages,
            eq(
              workspaceSourcePackages.id,
              packageRelationships.sourcePackageId,
            ),
          )
          .innerJoin(
            workspaceTargetPackages,
            eq(
              workspaceTargetPackages.id,
              packageRelationships.targetPackageId,
            ),
          )
          .where(
            and(
              eq(packageRelationships.workspaceId, workspaceId),
              eq(packageRelationships.targetRepositoryId, repositoryId),
              ne(packageRelationships.sourceRepositoryId, repositoryId),
              inArray(packageRelationships.targetPackageId, packageIds),
              eq(workspaceSourceRepositories.isActive, true),
              eq(workspaceTargetRepositories.isActive, true),
            ),
          )
          .limit(100)
      : [];
    const mappedSymbolRows: ImpactWorkspaceRelationshipCandidate[] =
      symbolRows.map((row) => ({
        id: row.id,
        sourceRepositoryId: row.sourceRepositoryId,
        sourceRepository: `${row.sourceRepositoryOwner}/${row.sourceRepositoryName}`,
        sourceFileId: row.sourceFileId,
        sourcePath: row.sourcePath,
        targetRepositoryId: row.targetRepositoryId,
        targetRepository: `${row.targetRepositoryOwner}/${row.targetRepositoryName}`,
        targetPath: row.targetPath,
        targetSymbol: row.targetSymbol,
        kind: row.kind,
        provenance:
          row.provenance as ImpactWorkspaceRelationshipCandidate["provenance"],
        confidence: row.confidence,
        sourceRevision: row.sourceRevision,
        targetRevision: row.targetRevision,
        evidence: row.evidence,
      }));
    const mappedPackageRows: ImpactWorkspaceRelationshipCandidate[] =
      packageRows.map((row) => ({
        id: row.id,
        sourceRepositoryId: row.sourceRepositoryId,
        sourceRepository: `${row.sourceRepositoryOwner}/${row.sourceRepositoryName}`,
        sourceFileId: null,
        sourcePath: row.sourcePath,
        targetRepositoryId: row.targetRepositoryId,
        targetRepository: `${row.targetRepositoryOwner}/${row.targetRepositoryName}`,
        targetPath: row.targetPath,
        targetSymbol: row.targetSymbol,
        kind: row.kind,
        provenance:
          row.provenance as ImpactWorkspaceRelationshipCandidate["provenance"],
        confidence: row.confidence,
        sourceRevision: row.sourceRevision,
        targetRevision: row.targetRevision,
        evidence: row.evidence,
      }));
    return [...mappedSymbolRows, ...mappedPackageRows];
  }

  async incomingHistoricalRelationships(
    workspaceId: string,
    repositoryId: string,
    targetSymbolIds: string[],
    targetFileIds: string[],
    scope: ImpactReportInput["scope"],
  ): Promise<ImpactHistoricalRelationshipCandidate[]> {
    if (!targetSymbolIds.length && !targetFileIds.length) return [];
    const targetSymbols =
      targetSymbolIds.length || targetFileIds.length
        ? await this.database.client
            .select({
              id: codeSymbols.id,
              stableKey: codeSymbols.stableKey,
              fileId: codeSymbols.fileId,
              packageId: codeSymbols.packageId,
            })
            .from(codeSymbols)
            .where(
              and(
                eq(codeSymbols.workspaceId, workspaceId),
                eq(codeSymbols.repositoryId, repositoryId),
                targetSymbolIds.length && targetFileIds.length
                  ? or(
                      inArray(codeSymbols.id, targetSymbolIds),
                      inArray(codeSymbols.fileId, targetFileIds),
                    )
                  : targetSymbolIds.length
                    ? inArray(codeSymbols.id, targetSymbolIds)
                    : inArray(codeSymbols.fileId, targetFileIds),
              ),
            )
        : [];
    const targetFiles = targetFileIds.length
      ? await this.database.client
          .select({ id: codeFiles.id, path: codeFiles.path })
          .from(codeFiles)
          .where(
            and(
              eq(codeFiles.workspaceId, workspaceId),
              eq(codeFiles.repositoryId, repositoryId),
              inArray(codeFiles.id, targetFileIds),
            ),
          )
      : [];
    const packageIds = [
      ...new Set(
        targetSymbols
          .map((item) => item.packageId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const targetPackages = packageIds.length
      ? await this.database.client
          .select({
            id: codePackages.id,
            name: codePackages.name,
            rootPath: codePackages.rootPath,
          })
          .from(codePackages)
          .where(
            and(
              eq(codePackages.workspaceId, workspaceId),
              eq(codePackages.repositoryId, repositoryId),
              inArray(codePackages.id, packageIds),
            ),
          )
      : [];
    const explicitSymbolIds = new Set(targetSymbolIds);
    const symbolKeys = targetSymbols
      .filter((item) => explicitSymbolIds.has(item.id))
      .map((item) => item.stableKey);
    const fileKeys = targetFiles.map((item) => item.path);
    const packageKeys = targetPackages.map(
      (item) => `${item.name}:${item.rootPath || "."}`,
    );
    const identityFilters: SQL[] = [];
    if (symbolKeys.length) {
      identityFilters.push(
        and(
          eq(relationshipObservations.targetEntityKind, "symbol"),
          inArray(relationshipObservations.targetEntityKey, symbolKeys),
        )!,
      );
    }
    if (fileKeys.length) {
      identityFilters.push(
        and(
          eq(relationshipObservations.targetEntityKind, "file"),
          inArray(relationshipObservations.targetEntityKey, fileKeys),
        )!,
      );
    }
    if (packageKeys.length) {
      identityFilters.push(
        and(
          eq(relationshipObservations.targetEntityKind, "package"),
          inArray(relationshipObservations.targetEntityKey, packageKeys),
        )!,
      );
    }
    if (!identityFilters.length) return [];

    const rows = await this.database.client
      .select({
        id: relationshipObservations.id,
        stableKey: relationshipObservations.stableKey,
        sourceRepositoryId: relationshipObservations.sourceRepositoryId,
        sourceRepositoryOwner: historicalSourceRepositories.owner,
        sourceRepositoryName: historicalSourceRepositories.name,
        sourceEntityKind: relationshipObservations.sourceEntityKind,
        sourceEntityKey: relationshipObservations.sourceEntityKey,
        targetRepositoryId: relationshipObservations.targetRepositoryId,
        targetRepositoryOwner: historicalTargetRepositories.owner,
        targetRepositoryName: historicalTargetRepositories.name,
        targetEntityKind: relationshipObservations.targetEntityKind,
        targetEntityKey: relationshipObservations.targetEntityKey,
        kind: relationshipObservations.kind,
        provenance: relationshipObservations.provenance,
        confidence: relationshipObservations.confidence,
        observedRevision: relationshipObservations.observedRevision,
        sourceRevision: relationshipObservations.sourceRevision,
        targetRevision: relationshipObservations.targetRevision,
        evidence: relationshipObservations.evidence,
        observedAt: relationshipObservations.observedAt,
      })
      .from(relationshipObservations)
      .innerJoin(
        historicalSourceRepositories,
        eq(
          historicalSourceRepositories.id,
          relationshipObservations.sourceRepositoryId,
        ),
      )
      .innerJoin(
        historicalTargetRepositories,
        eq(
          historicalTargetRepositories.id,
          relationshipObservations.targetRepositoryId,
        ),
      )
      .where(
        and(
          eq(relationshipObservations.workspaceId, workspaceId),
          eq(relationshipObservations.targetRepositoryId, repositoryId),
          scope === "repository"
            ? eq(relationshipObservations.sourceRepositoryId, repositoryId)
            : undefined,
          or(...identityFilters),
          eq(historicalSourceRepositories.isActive, true),
          eq(historicalTargetRepositories.isActive, true),
        ),
      )
      .orderBy(desc(relationshipObservations.observedAt))
      .limit(300);

    const [currentFileRelationships, currentPackageRelationships, currentSymbolRelationships] =
      await Promise.all([
        targetFileIds.length
          ? this.database.client
              .select({ stableKey: codeRelationships.stableKey })
              .from(codeRelationships)
              .where(
                and(
                  eq(codeRelationships.workspaceId, workspaceId),
                  eq(codeRelationships.repositoryId, repositoryId),
                  inArray(codeRelationships.targetFileId, targetFileIds),
                ),
              )
          : [],
        packageIds.length
          ? this.database.client
              .select({ stableKey: packageRelationships.stableKey })
              .from(packageRelationships)
              .where(
                and(
                  eq(packageRelationships.workspaceId, workspaceId),
                  inArray(packageRelationships.targetPackageId, packageIds),
                ),
              )
          : [],
        targetSymbolIds.length
          ? this.database.client
              .select({ stableKey: symbolRelationships.stableKey })
              .from(symbolRelationships)
              .where(
                and(
                  eq(symbolRelationships.workspaceId, workspaceId),
                  inArray(
                    symbolRelationships.targetSymbolId,
                    targetSymbolIds,
                  ),
                ),
              )
          : [],
      ]);
    const currentStableKeys = new Set([
      ...currentFileRelationships.map(
        (item) => `file:${repositoryId}:${item.stableKey}`,
      ),
      ...currentPackageRelationships.map(
        (item) => `package:${item.stableKey}`,
      ),
      ...currentSymbolRelationships.map(
        (item) => `symbol:${item.stableKey}`,
      ),
    ]);
    const latestHistoricalRows = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (
        currentStableKeys.has(row.stableKey) ||
        latestHistoricalRows.has(row.stableKey)
      ) {
        continue;
      }
      latestHistoricalRows.set(row.stableKey, row);
    }

    return [...latestHistoricalRows.values()].slice(0, 50).map((row) => {
      const sourcePath =
        typeof row.evidence.sourcePath === "string"
          ? row.evidence.sourcePath
          : typeof row.evidence.sourceManifestPath === "string"
            ? row.evidence.sourceManifestPath
            : row.sourceEntityKey;
      const targetPath =
        typeof row.evidence.targetPath === "string"
          ? row.evidence.targetPath
          : typeof row.evidence.targetManifestPath === "string"
            ? row.evidence.targetManifestPath
            : row.targetEntityKey;
      const targetSymbol =
        row.targetEntityKind === "symbol" &&
        typeof row.evidence.importedName === "string"
          ? row.evidence.importedName
          : null;
      return {
        id: row.id,
        stableKey: row.stableKey,
        sourceRepositoryId: row.sourceRepositoryId,
        sourceRepository: `${row.sourceRepositoryOwner}/${row.sourceRepositoryName}`,
        sourcePath,
        sourceEntityKind: row.sourceEntityKind,
        targetRepositoryId: row.targetRepositoryId,
        targetRepository: `${row.targetRepositoryOwner}/${row.targetRepositoryName}`,
        targetPath,
        targetSymbol,
        targetEntityKind: row.targetEntityKind,
        kind: row.kind,
        originalProvenance: row.provenance,
        confidence: row.confidence,
        observedRevision: row.observedRevision,
        sourceRevision: row.sourceRevision,
        targetRevision: row.targetRevision,
        observedAt: row.observedAt,
        evidence: row.evidence,
      };
    });
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

  async findFeedback(
    workspaceId: string,
    reportId: string,
    userId: string,
  ) {
    const [feedback] = await this.database.client
      .select()
      .from(impactReportFeedback)
      .where(
        and(
          eq(impactReportFeedback.workspaceId, workspaceId),
          eq(impactReportFeedback.reportId, reportId),
          eq(impactReportFeedback.submittedByUserId, userId),
        ),
      )
      .limit(1);
    return feedback ?? null;
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

  async upsertFeedback(input: {
    workspaceId: string;
    reportId: string;
    submittedByUserId: string;
    rating: "useful" | "not_useful";
    confirmedFindingIds: string[];
    missedImpact: string | null;
    comment: string | null;
  }) {
    return this.database.client.transaction(async (transaction) => {
      const [report] = await transaction
        .select({ createdAt: impactReports.createdAt })
        .from(impactReports)
        .where(
          and(
            eq(impactReports.workspaceId, input.workspaceId),
            eq(impactReports.id, input.reportId),
          ),
        )
        .limit(1);
      if (!report) return null;

      const [feedback] = await transaction
        .insert(impactReportFeedback)
        .values(input)
        .onConflictDoUpdate({
          target: [
            impactReportFeedback.reportId,
            impactReportFeedback.submittedByUserId,
          ],
          set: {
            rating: input.rating,
            confirmedFindingIds: input.confirmedFindingIds,
            missedImpact: input.missedImpact,
            comment: input.comment,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!feedback) return null;

      const timeToFeedbackSeconds = Math.max(
        0,
        Math.round(
          (feedback.updatedAt.getTime() - report.createdAt.getTime()) /
            1_000,
        ),
      );
      await transaction.insert(auditEvents).values({
        workspaceId: input.workspaceId,
        actorUserId: input.submittedByUserId,
        action: "impact.feedback.submitted",
        targetType: "impact_report",
        targetId: input.reportId,
        metadata: {
          rating: input.rating,
          confirmedFindingCount: input.confirmedFindingIds.length,
          hasMissedImpact: Boolean(input.missedImpact),
          hasComment: Boolean(input.comment),
          timeToFeedbackSeconds,
        },
      });
      return { ...feedback, timeToFeedbackSeconds };
    });
  }
}
