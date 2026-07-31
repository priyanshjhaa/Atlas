import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { expandedQueryTerms } from "../intelligence/query-terms";
import { RetrievalService } from "../intelligence/retrieval.service";
import {
  ImpactRepository,
  type ImpactFileCandidate,
  type ImpactHistoricalRelationshipCandidate,
  type ImpactRelationshipCandidate,
  type ImpactRepositoryDetails,
  type ImpactSymbolCandidate,
  type ImpactWorkspaceRelationshipCandidate,
} from "./impact.repository";
import type {
  ImpactCitation,
  ImpactFinding,
  ImpactReportInput,
  ImpactReportResult,
  ImpactResolvedEntity,
  ImpactRiskLevel,
} from "./impact.types";

interface SearchResult {
  id: string;
  score: number;
  lexicalMatches?: number;
  reason: string;
  excerpt: string;
  citation: {
    repositoryId: string;
    filePath: string;
    lineStart?: number;
    lineEnd?: number;
    symbol?: string;
    provenance: "indexed_source_chunk";
  };
}

@Injectable()
export class ImpactAnalysisService {
  constructor(
    private readonly repository: ImpactRepository,
    private readonly retrieval: RetrievalService,
  ) {}

  async analyze(
    workspaceId: string,
    input: ImpactReportInput,
  ): Promise<ImpactReportResult> {
    const sourceRepository = await this.repository.repositoryDetails(
      workspaceId,
      input.repositoryId,
    );
    if (!sourceRepository) {
      throw new NotFoundException("Repository not found.");
    }
    if (!sourceRepository.lastSyncedRevision) {
      throw new BadRequestException(
        "Synchronize the repository before analyzing a change.",
      );
    }

    const query = [input.description, ...input.anchors]
      .join("\n")
      .slice(0, 32_000);
    const retrieval = (await this.retrieval.search(
      workspaceId,
      input.repositoryId,
      query,
    )) as {
      results: SearchResult[];
      lowConfidence: boolean;
    };
    const topScore = retrieval.results[0]?.score ?? 0;
    const minimumScore = Math.max(0.38, topScore - 0.2);
    const searchResults = retrieval.results
      .filter(
        (result) =>
          this.matchesExplicitAnchor(result, input.anchors) ||
          (result.lexicalMatches ?? 0) > 0 ||
          (this.isCodePath(result.citation.filePath) &&
            result.score >= minimumScore),
      )
      .slice(0, 16);
    const explicitPaths = input.anchors.filter((anchor) =>
      this.isCodePath(anchor),
    );
    let files = await this.repository.filesByPaths(
      workspaceId,
      input.repositoryId,
      [
        ...new Set([
          ...explicitPaths,
          ...searchResults.map((result) => result.citation.filePath),
        ]),
      ],
    );
    const terms = expandedQueryTerms(query);
    const symbols = await this.repository.matchingSymbols(
      workspaceId,
      input.repositoryId,
      terms,
      files.map((file) => file.id),
    );
    const missingSymbolPaths = symbols
      .map((symbol) => symbol.filePath)
      .filter((path) => !files.some((file) => file.path === path));
    if (missingSymbolPaths.length) {
      files = [
        ...files,
        ...(await this.repository.filesByPaths(
          workspaceId,
          input.repositoryId,
          [...new Set(missingSymbolPaths)],
        )),
      ];
    }
    const resolvedEntities = this.resolveEntities(
      files,
      symbols,
      searchResults,
      terms,
      input.anchors,
    );
    const evidence = this.chunkEvidence(
      sourceRepository,
      sourceRepository.lastSyncedRevision,
      searchResults,
    );
    const directImpacts = this.directFindings(
      sourceRepository,
      resolvedEntities,
      evidence,
    );

    const seedFileIds = [
      ...new Set(
        resolvedEntities
          .map((entity) => files.find((file) => file.path === entity.filePath))
          .filter((file): file is ImpactFileCandidate => Boolean(file))
          .map((file) => file.id),
      ),
    ];
    const relationships = await this.traverseIncomingRelationships(
      workspaceId,
      input.repositoryId,
      seedFileIds,
    );
    const relationshipOutput = this.relationshipFindings(
      sourceRepository,
      relationships,
    );
    evidence.push(...relationshipOutput.evidence);
    const historicalRelationships =
      await this.repository.incomingHistoricalRelationships(
        workspaceId,
        input.repositoryId,
        resolvedEntities
          .filter((entity) => entity.kind === "symbol")
          .map((entity) => entity.id),
        seedFileIds,
        input.scope,
      );
    const historicalOutput = this.historicalRelationshipFindings(
      historicalRelationships,
    );
    evidence.push(...historicalOutput.evidence);
    let workspaceGraphAvailable = false;
    let workspaceOutput: {
      findings: ImpactFinding[];
      evidence: ImpactCitation[];
    } = { findings: [], evidence: [] };
    if (input.scope === "workspace") {
      const [available, workspaceRelationships] = await Promise.all([
        this.repository.hasWorkspaceRelationshipIndex(workspaceId),
        this.repository.incomingWorkspaceRelationships(
          workspaceId,
          input.repositoryId,
          resolvedEntities
            .filter((entity) => entity.kind === "symbol")
            .map((entity) => entity.id),
          seedFileIds,
        ),
      ]);
      workspaceGraphAvailable = available;
      workspaceOutput = this.workspaceRelationshipFindings(
        workspaceRelationships,
      );
      evidence.push(...workspaceOutput.evidence);
    }
    const currentDownstreamFindings = [
      ...relationshipOutput.findings,
      ...workspaceOutput.findings,
    ];
    const downstreamFindings = [
      ...currentDownstreamFindings,
      ...historicalOutput.findings,
    ];

    const limitations = this.limitations(
      input,
      retrieval.lowConfidence,
      resolvedEntities.length,
      workspaceGraphAvailable,
      historicalOutput.findings.length,
    );
    const unknownImpacts = this.unknownFindings(
      sourceRepository,
      input,
      resolvedEntities.length,
      currentDownstreamFindings.length,
      workspaceGraphAvailable,
    );
    const risk = this.risk(
      directImpacts,
      downstreamFindings,
      unknownImpacts,
      retrieval.lowConfidence,
    );
    const status =
      directImpacts.length > 0 ? "complete" : "insufficient_evidence";

    return {
      status,
      title: this.title(input.description),
      answer: this.answer(
        sourceRepository,
        input.description,
        directImpacts,
        downstreamFindings,
      ),
      executiveSummary: this.summary(
        sourceRepository,
        directImpacts.length,
        downstreamFindings.length,
        unknownImpacts.length,
      ),
      risk,
      repository: {
        id: sourceRepository.id,
        owner: sourceRepository.owner,
        name: sourceRepository.name,
        defaultBranch: sourceRepository.defaultBranch,
      },
      sourceRevision: sourceRepository.lastSyncedRevision,
      scope: input.scope,
      resolvedEntities,
      directImpacts,
      downstreamImpacts: downstreamFindings,
      unknownImpacts,
      evidence,
      relationshipPath: this.relationshipPath(
        sourceRepository,
        resolvedEntities,
        downstreamFindings,
      ),
      recommendations: this.recommendations(
        input.description,
        directImpacts,
        downstreamFindings,
        unknownImpacts,
      ),
      verificationPlan: this.verificationPlan(
        directImpacts,
        downstreamFindings,
        input.scope,
      ),
      limitations,
      generatedAt: new Date().toISOString(),
    };
  }

  private resolveEntities(
    files: ImpactFileCandidate[],
    symbols: ImpactSymbolCandidate[],
    results: SearchResult[],
    terms: string[],
    anchors: string[],
  ): ImpactResolvedEntity[] {
    const scoreByPath = new Map(
      results.map((result) => [
        result.citation.filePath,
        Math.max(0.2, result.score),
      ]),
    );
    const fileIds = new Set(files.map((file) => file.id));
    const rankedSymbols = symbols
      .filter((symbol) => fileIds.has(symbol.fileId))
      .map((symbol) => {
        const normalizedName = symbol.name.toLowerCase();
        const lexicalScore = terms.some(
          (term) =>
            normalizedName === term || normalizedName.includes(term),
        )
          ? 0.18
          : 0;
        return {
          symbol,
          score: Math.min(
            1,
            (scoreByPath.get(symbol.filePath) ?? 0.3) +
              lexicalScore +
              (symbol.exported ? 0.05 : 0),
          ),
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 6);

    const entities: ImpactResolvedEntity[] = rankedSymbols.map(
      ({ symbol, score }) => ({
        id: symbol.id,
        kind: "symbol",
        name: symbol.name,
        filePath: symbol.filePath,
        lineStart: symbol.lineStart,
        lineEnd: symbol.lineEnd,
        confidence: score,
      }),
    );
    const symbolPaths = new Set(entities.map((entity) => entity.filePath));
    for (const file of files) {
      if (entities.length >= 8 || symbolPaths.has(file.path)) continue;
      const explicit = anchors.some(
        (anchor) => anchor.toLowerCase() === file.path.toLowerCase(),
      );
      const confidence = explicit ? 0.95 : (scoreByPath.get(file.path) ?? 0.3);
      if (!this.isCodePath(file.path) || confidence < 0.4) continue;
      entities.push({
        id: file.id,
        kind: "file",
        name: file.path.split("/").at(-1) ?? file.path,
        filePath: file.path,
        confidence,
      });
    }
    return entities;
  }

  private chunkEvidence(
    repository: ImpactRepositoryDetails,
    sourceRevision: string,
    results: SearchResult[],
  ): ImpactCitation[] {
    return results.map((result) => ({
      id: `chunk:${result.id}`,
      repositoryId: repository.id,
      repository: `${repository.owner}/${repository.name}`,
      filePath: result.citation.filePath,
      lineStart: result.citation.lineStart,
      lineEnd: result.citation.lineEnd,
      symbol: result.citation.symbol,
      excerpt: result.excerpt.slice(0, 600),
      provenance: "indexed_source_chunk",
      sourceRevision,
    }));
  }

  private directFindings(
    repository: ImpactRepositoryDetails,
    entities: ImpactResolvedEntity[],
    evidence: ImpactCitation[],
  ): ImpactFinding[] {
    return entities.map((entity) => ({
      id: `direct:${entity.id}`,
      classification: "direct",
      kind: entity.kind === "symbol" ? "Symbol" : "File",
      title:
        entity.kind === "symbol"
          ? `${entity.name} · ${entity.filePath}`
          : entity.filePath,
      detail:
        entity.kind === "symbol"
          ? "This indexed symbol matched the planned change and is a candidate modification anchor."
          : "This indexed file matched the planned change and should be reviewed as a candidate modification anchor.",
      repositoryId: repository.id,
      repository: `${repository.owner}/${repository.name}`,
      filePath: entity.filePath,
      symbol: entity.kind === "symbol" ? entity.name : undefined,
      hop: 0,
      confidence: entity.confidence,
      provenance: "indexed_source_chunk",
      evidenceIds: evidence
        .filter((item) => item.filePath === entity.filePath)
        .map((item) => item.id),
    }));
  }

  private async traverseIncomingRelationships(
    workspaceId: string,
    repositoryId: string,
    seedFileIds: string[],
  ): Promise<Array<{ relationship: ImpactRelationshipCandidate; hop: number }>> {
    const traversed: Array<{
      relationship: ImpactRelationshipCandidate;
      hop: number;
    }> = [];
    const visitedFiles = new Set(seedFileIds);
    let frontier = seedFileIds;

    for (let hop = 1; hop <= 2 && frontier.length; hop += 1) {
      const rows = await this.repository.incomingRelationships(
        workspaceId,
        repositoryId,
        frontier,
      );
      const nextFrontier: string[] = [];
      for (const relationship of rows) {
        if (visitedFiles.has(relationship.sourceFileId)) continue;
        visitedFiles.add(relationship.sourceFileId);
        traversed.push({ relationship, hop });
        nextFrontier.push(relationship.sourceFileId);
      }
      frontier = nextFrontier;
    }
    return traversed.slice(0, 30);
  }

  private relationshipFindings(
    repository: ImpactRepositoryDetails,
    traversed: Array<{
      relationship: ImpactRelationshipCandidate;
      hop: number;
    }>,
  ): { findings: ImpactFinding[]; evidence: ImpactCitation[] } {
    const findings: ImpactFinding[] = [];
    const evidence: ImpactCitation[] = [];
    traversed.forEach(({ relationship, hop }) => {
      const evidenceId = `relationship:${relationship.id}`;
      const line =
        typeof relationship.evidence.line === "number"
          ? relationship.evidence.line
          : undefined;
      const specifier =
        typeof relationship.evidence.importSpecifier === "string"
          ? relationship.evidence.importSpecifier
          : relationship.targetPath;
      evidence.push({
        id: evidenceId,
        repositoryId: repository.id,
        repository: `${repository.owner}/${repository.name}`,
        filePath: relationship.sourcePath,
        lineStart: line,
        lineEnd: line,
        excerpt: `Imports ${specifier}, resolving to ${relationship.targetPath}.`,
        provenance: "typescript_static_import",
        sourceRevision: relationship.sourceRevision,
      });
      findings.push({
        id: `downstream:${relationship.id}`,
        classification: "downstream",
        kind: "Consumer",
        title: relationship.sourcePath,
        detail: `${relationship.sourcePath} imports ${relationship.targetPath}; changes to the target can affect this consumer${hop > 1 ? ` through ${hop} observed hops` : ""}.`,
        repositoryId: repository.id,
        repository: `${repository.owner}/${repository.name}`,
        filePath: relationship.sourcePath,
        hop,
        confidence: relationship.confidence,
        provenance: "typescript_static_import",
        evidenceIds: [evidenceId],
      });
    });
    return { findings, evidence };
  }

  private workspaceRelationshipFindings(
    relationships: ImpactWorkspaceRelationshipCandidate[],
  ): { findings: ImpactFinding[]; evidence: ImpactCitation[] } {
    const ranked = [...relationships].sort((left, right) => {
      const rank = (item: ImpactWorkspaceRelationshipCandidate) =>
        item.provenance === "typescript_public_api_call"
          ? 3
          : item.provenance === "typescript_public_api_import"
            ? 2
            : 1;
      return rank(right) - rank(left);
    });
    const callKeys = new Set(
      ranked
        .filter(
          (item) => item.provenance === "typescript_public_api_call",
        )
        .map(
          (item) =>
            `${item.sourceRepositoryId}:${item.sourcePath}:${item.targetPath}:${item.targetSymbol ?? ""}`,
        ),
    );
    const repositoriesWithSymbolEvidence = new Set(
      ranked
        .filter(
          (item) => item.provenance !== "package_manifest_dependency",
        )
        .map((item) => item.sourceRepositoryId),
    );
    const findings: ImpactFinding[] = [];
    const evidence: ImpactCitation[] = [];

    for (const relationship of ranked) {
      const relationshipKey = `${relationship.sourceRepositoryId}:${relationship.sourcePath}:${relationship.targetPath}:${relationship.targetSymbol ?? ""}`;
      if (
        relationship.provenance === "typescript_public_api_import" &&
        callKeys.has(relationshipKey)
      ) {
        continue;
      }
      if (
        relationship.provenance === "package_manifest_dependency" &&
        repositoriesWithSymbolEvidence.has(relationship.sourceRepositoryId)
      ) {
        continue;
      }
      const evidenceId = `workspace-relationship:${relationship.id}`;
      const line =
        typeof relationship.evidence.line === "number"
          ? relationship.evidence.line
          : Array.isArray(relationship.evidence.lines) &&
              typeof relationship.evidence.lines[0] === "number"
            ? relationship.evidence.lines[0]
            : undefined;
      const excerpt =
        relationship.provenance === "typescript_public_api_call"
          ? `Calls ${relationship.targetSymbol ?? "a public API"} from ${relationship.targetPath}.`
          : relationship.provenance === "typescript_public_api_import"
            ? `Imports ${relationship.targetSymbol ?? "a public API"} from ${relationship.targetPath}.`
            : `Declares a package dependency on ${relationship.targetSymbol ?? relationship.targetPath}.`;
      evidence.push({
        id: evidenceId,
        repositoryId: relationship.sourceRepositoryId,
        repository: relationship.sourceRepository,
        filePath: relationship.sourcePath,
        lineStart: line,
        lineEnd: line,
        symbol: relationship.targetSymbol ?? undefined,
        excerpt,
        provenance: relationship.provenance,
        sourceRevision: relationship.sourceRevision,
      });
      findings.push({
        id: `workspace-downstream:${relationship.id}`,
        classification: "downstream",
        kind: "Consumer",
        title: `${relationship.sourceRepository} · ${relationship.sourcePath}`,
        detail:
          relationship.provenance === "typescript_public_api_call"
            ? `${relationship.sourcePath} calls ${relationship.targetSymbol ?? relationship.targetPath} across the repository boundary.`
            : relationship.provenance === "typescript_public_api_import"
              ? `${relationship.sourcePath} imports the public API ${relationship.targetSymbol ?? relationship.targetPath} across the repository boundary.`
              : `${relationship.sourceRepository} declares a manifest dependency on the affected package.`,
        repositoryId: relationship.sourceRepositoryId,
        repository: relationship.sourceRepository,
        filePath: relationship.sourcePath,
        symbol: relationship.targetSymbol ?? undefined,
        hop: 1,
        confidence: relationship.confidence,
        provenance: relationship.provenance,
        evidenceIds: [evidenceId],
      });
    }
    return { findings, evidence };
  }

  private historicalRelationshipFindings(
    relationships: ImpactHistoricalRelationshipCandidate[],
  ): { findings: ImpactFinding[]; evidence: ImpactCitation[] } {
    const findings: ImpactFinding[] = [];
    const evidence: ImpactCitation[] = [];
    for (const relationship of relationships) {
      const evidenceId = `historical-relationship:${relationship.id}`;
      const line =
        typeof relationship.evidence.line === "number"
          ? relationship.evidence.line
          : Array.isArray(relationship.evidence.lines) &&
              typeof relationship.evidence.lines[0] === "number"
            ? relationship.evidence.lines[0]
            : undefined;
      const observedRevision = relationship.observedRevision.slice(0, 12);
      evidence.push({
        id: evidenceId,
        repositoryId: relationship.sourceRepositoryId,
        repository: relationship.sourceRepository,
        filePath: relationship.sourcePath,
        lineStart: line,
        lineEnd: line,
        symbol: relationship.targetSymbol ?? undefined,
        excerpt: `Historically observed ${relationship.originalProvenance} from ${relationship.sourcePath} to ${relationship.targetPath} at revision ${observedRevision}; the same stable edge is absent from the current index.`,
        provenance: "historical_relationship",
        sourceRevision: relationship.sourceRevision,
      });
      findings.push({
        id: `historical-downstream:${relationship.id}`,
        classification: "downstream",
        kind: "Consumer",
        title: `${relationship.sourceRepository} · ${relationship.sourcePath}`,
        detail: `${relationship.sourcePath} was linked to ${relationship.targetSymbol ?? relationship.targetPath} at revision ${observedRevision}. The same stable relationship is not present in the current index and must be revalidated before treating it as a current consumer.`,
        repositoryId: relationship.sourceRepositoryId,
        repository: relationship.sourceRepository,
        filePath: relationship.sourcePath,
        symbol: relationship.targetSymbol ?? undefined,
        hop: 1,
        confidence: Math.min(0.75, relationship.confidence * 0.75),
        provenance: "historical_relationship",
        evidenceIds: [evidenceId],
      });
    }
    return { findings, evidence };
  }

  private unknownFindings(
    repository: ImpactRepositoryDetails,
    input: ImpactReportInput,
    resolvedCount: number,
    downstreamCount: number,
    workspaceGraphAvailable: boolean,
  ): ImpactFinding[] {
    const unknowns: ImpactFinding[] = [];
    if (!resolvedCount) {
      unknowns.push({
        id: "unknown:unresolved-input",
        classification: "unknown",
        kind: "Unknown",
        title: "Planned change could not be resolved confidently",
        detail:
          "No indexed file or symbol matched strongly enough. Add exact file paths or symbol anchors before relying on the report.",
        repositoryId: repository.id,
        repository: `${repository.owner}/${repository.name}`,
        hop: 0,
        confidence: 0,
        provenance: "analysis_gap",
        evidenceIds: [],
      });
    }
    if (!downstreamCount) {
      unknowns.push({
        id: "unknown:no-observed-consumers",
        classification: "unknown",
        kind: "Unknown",
        title: "No current observed downstream consumers",
        detail:
          "The current indexed relationship graph contains no incoming consumer path for the resolved anchors. Historical, runtime, and external consumers remain unverified.",
        repositoryId: repository.id,
        repository: `${repository.owner}/${repository.name}`,
        hop: 1,
        confidence: 0,
        provenance: "analysis_gap",
        evidenceIds: [],
      });
    }
    if (input.scope === "workspace" && !workspaceGraphAvailable) {
      unknowns.push({
        id: "unknown:cross-repository-links",
        classification: "unknown",
        kind: "Unknown",
        title: "Cross-repository consumers are not yet structurally linked",
        detail:
          "Atlas searched the selected repository index, but stable package and API links across repositories are not available in this analysis version.",
        repositoryId: repository.id,
        repository: `${repository.owner}/${repository.name}`,
        hop: 2,
        confidence: 0,
        provenance: "analysis_gap",
        evidenceIds: [],
      });
    }
    return unknowns;
  }

  private risk(
    direct: ImpactFinding[],
    downstream: ImpactFinding[],
    unknowns: ImpactFinding[],
    lowConfidence: boolean,
  ): ImpactReportResult["risk"] {
    if (!direct.length) {
      return {
        level: "insufficient",
        score: null,
        reasons: [
          "No indexed modification anchor was resolved",
          "Risk cannot be scored without supporting source evidence",
        ],
      };
    }
    const historicalDownstream = downstream.filter(
      (item) => item.provenance === "historical_relationship",
    );
    const currentDownstream = downstream.filter(
      (item) => item.provenance !== "historical_relationship",
    );
    const score = Math.min(
      100,
      direct.length * 6 +
        currentDownstream.filter((item) => item.hop === 1).length * 12 +
        currentDownstream.filter((item) => item.hop > 1).length * 7 +
        historicalDownstream.length * 5 +
        unknowns.length * 8 +
        (lowConfidence ? 15 : 0),
    );
    const level: ImpactRiskLevel =
      score >= 60 ? "high" : score >= 30 ? "medium" : "low";
    const reasons = [
      `${direct.length} indexed modification anchor${direct.length === 1 ? "" : "s"} resolved`,
      `${currentDownstream.length} current downstream consumer${currentDownstream.length === 1 ? "" : "s"} found`,
    ];
    if (historicalDownstream.length) {
      reasons.push(
        `${historicalDownstream.length} historical relationship${historicalDownstream.length === 1 ? "" : "s"} require revalidation`,
      );
    }
    if (unknowns.length) {
      reasons.push(
        `${unknowns.length} analysis gap${unknowns.length === 1 ? "" : "s"} require verification`,
      );
    }
    return { level, score, reasons };
  }

  private answer(
    repository: ImpactRepositoryDetails,
    description: string,
    direct: ImpactFinding[],
    downstream: ImpactFinding[],
  ): string {
    if (!direct.length) {
      return `Atlas cannot answer this change question from the indexed evidence in ${repository.owner}/${repository.name}. No source file or symbol was resolved strongly enough to support a recommendation.`;
    }
    const anchors = [
      ...new Set(direct.map((item) => item.filePath ?? item.title)),
    ];
    const consumers = [
      ...new Set(downstream.map((item) => item.filePath ?? item.title)),
    ];
    const historicalCount = downstream.filter(
      (item) => item.provenance === "historical_relationship",
    ).length;
    const currentCount = downstream.length - historicalCount;
    if (this.isBetterAuthJwtMigration(description)) {
      const betterAuthPaths = anchors.filter((path) =>
        /^(?:lib\/auth(?:-session|-client)?\.ts|app\/api\/auth\/)/i.test(path),
      );
      const jwtPaths = anchors.filter((path) =>
        /(?:jwt|auth\.guard)/i.test(path),
      );
      if (betterAuthPaths.length && jwtPaths.length) {
        return `This is a cross-boundary authentication migration, not a single-provider swap. Better Auth is anchored in ${betterAuthPaths.slice(0, 3).join(", ")}, while local JWT verification already exists in ${jwtPaths.slice(0, 3).join(", ")}. Replacing Better Auth therefore affects session creation and access on the web boundary plus the claims contract consumed by the backend.`;
      }
    }
    return downstream.length
      ? `The change is most strongly anchored in ${anchors.slice(0, 3).join(", ")}. The indexed relationship graph shows ${currentCount} current consumer${currentCount === 1 ? "" : "s"} and ${historicalCount} historical relationship${historicalCount === 1 ? "" : "s"}, including ${consumers.slice(0, 3).join(", ")}. Historical relationships require revalidation before they are treated as current contracts.`
      : `The change is most strongly anchored in ${anchors.slice(0, 3).join(", ")}. Atlas found no incoming consumer in the indexed relationship graph, so runtime, configuration, and external integrations still require manual verification.`;
  }

  private recommendations(
    description: string,
    direct: ImpactFinding[],
    downstream: ImpactFinding[],
    unknowns: ImpactFinding[],
  ): string[] {
    if (!direct.length) {
      return [
        "Add an exact source file, symbol, route, or configuration key as an anchor and rerun the analysis.",
        "Synchronize the repository again if the relevant implementation was added after the recorded source revision.",
      ];
    }
    const directPaths = [
      ...new Set(
        direct
          .map((item) => item.filePath)
          .filter((path): path is string => Boolean(path)),
      ),
    ];
    const currentConsumerPaths = [
      ...new Set(
        downstream
          .filter(
            (item) => item.provenance !== "historical_relationship",
          )
          .map((item) => item.filePath)
          .filter((path): path is string => Boolean(path)),
      ),
    ];
    const historicalConsumerPaths = [
      ...new Set(
        downstream
          .filter(
            (item) => item.provenance === "historical_relationship",
          )
          .map((item) => item.filePath)
          .filter((path): path is string => Boolean(path)),
      ),
    ];
    const consumerPaths = [
      ...currentConsumerPaths,
      ...historicalConsumerPaths,
    ];
    if (this.isBetterAuthJwtMigration(description)) {
      const relevantPaths = [...directPaths, ...consumerPaths];
      const findPaths = (pattern: RegExp) =>
        [...new Set(relevantPaths.filter((path) => pattern.test(path)))]
          .slice(0, 4)
          .join(", ");
      const sessionBoundary = findPaths(
        /(?:lib\/auth|auth-session|auth-client|api\/auth)/i,
      );
      const jwtBoundary = findPaths(/(?:jwt-verifier|auth\.guard|backend-client)/i);
      return [
        `Define the replacement session-issuance and sign-in contract${sessionBoundary ? ` across ${sessionBoundary}` : ""}; do not replace only the provider configuration.`,
        `Keep JWT claims, expiry, revocation, and backend verification compatible${jwtBoundary ? ` with ${jwtBoundary}` : ""}.`,
        "Verify sign-in, sign-out, expired-token rejection, revoked-session rejection, and protection of every /app route.",
        "Migrate cookie or token storage deliberately and avoid exposing bearer tokens to browser JavaScript unless the threat model requires it.",
      ];
    }
    const recommendations = [
      `Start the implementation review with ${directPaths.slice(0, 4).join(", ")}.`,
    ];
    if (currentConsumerPaths.length) {
      recommendations.push(
        `Preserve or deliberately migrate the contracts used by ${currentConsumerPaths.slice(0, 4).join(", ")}.`,
      );
    }
    if (historicalConsumerPaths.length) {
      recommendations.push(
        `Revalidate historical consumers against the current source revision before preserving or migrating former contracts: ${historicalConsumerPaths.slice(0, 4).join(", ")}.`,
      );
    }
    const tests = [...directPaths, ...consumerPaths].filter((path) =>
      /(?:test|spec|e2e)/i.test(path),
    );
    recommendations.push(
      tests.length
        ? `Run and update the observed tests: ${tests.slice(0, 4).join(", ")}.`
        : "Add or update focused tests for the resolved anchors and their observed consumers.",
    );
    if (unknowns.length) {
      recommendations.push(
        "Verify the recorded analysis gaps before rollout; Atlas does not infer unobserved runtime or external dependencies.",
      );
    }
    return recommendations;
  }

  private isBetterAuthJwtMigration(description: string): boolean {
    return /better\s*-?\s*auth/i.test(description) && /\bjwt\b/i.test(description);
  }

  private relationshipPath(
    repository: ImpactRepositoryDetails,
    entities: ImpactResolvedEntity[],
    downstream: ImpactFinding[],
  ) {
    const path: ImpactReportResult["relationshipPath"] = [];
    const first = entities[0];
    if (first) {
      path.push({
        repository: `${repository.owner}/${repository.name}`,
        filePath: first.filePath,
        hop: 0,
      });
    }
    for (const finding of downstream.slice(0, 4)) {
      if (!finding.filePath) continue;
      path.push({
        repository: finding.repository,
        filePath: finding.filePath,
        hop: finding.hop,
      });
    }
    return path;
  }

  private verificationPlan(
    direct: ImpactFinding[],
    downstream: ImpactFinding[],
    scope: ImpactReportInput["scope"],
  ): string[] {
    const historicalCount = downstream.filter(
      (item) => item.provenance === "historical_relationship",
    ).length;
    const currentCount = downstream.length - historicalCount;
    const plan = [
      `Review the ${direct.length} resolved modification anchor${direct.length === 1 ? "" : "s"} against the intended behavior.`,
      "Run type-checking and focused tests for every directly changed module.",
    ];
    if (currentCount) {
      plan.push(
        `Exercise the ${currentCount} observed consumer${currentCount === 1 ? "" : "s"} before rollout.`,
      );
    }
    if (historicalCount) {
      plan.push(
        historicalCount === 1
          ? "Confirm whether the historical relationship still exists before using it as current impact evidence."
          : `Confirm whether the ${historicalCount} historical relationships still exist before using them as current impact evidence.`,
      );
    }
    if (scope === "workspace") {
      plan.push(
        "Confirm runtime, event-driven, and external consumers that are not represented by indexed static relationships.",
      );
    }
    return plan;
  }

  private limitations(
    input: ImpactReportInput,
    lowConfidence: boolean,
    resolvedCount: number,
    workspaceGraphAvailable: boolean,
    historicalCount: number,
  ): string[] {
    const limitations = [
      "Results describe indexed source at the recorded revision, not uncommitted working-tree changes.",
      "Observed relationships come from package manifests and statically resolved TypeScript and JavaScript imports and calls.",
    ];
    if (input.scope === "workspace" && !workspaceGraphAvailable) {
      limitations.push(
        "Workspace-wide cross-repository package and API traversal is not available until stable cross-repository links are indexed.",
      );
    } else if (input.scope === "workspace") {
      limitations.push(
        "Cross-repository traversal covers indexed package manifests and statically observed public API imports and calls; runtime dispatch and external systems remain unverified.",
      );
    }
    if (historicalCount) {
      limitations.push(
        "Historical relationships record previously indexed structure and are not proof that the same consumer still exists at the current revision.",
      );
    }
    if (input.mode === "pull-request") {
      const budget = input.pullRequest?.analysisBudget;
      limitations.push(
        "Pull-request changes are resolved against the synchronized base index; newly introduced files and symbols remain unknown until the head revision is indexed.",
      );
      if (budget) {
        limitations.push(
          `GitHub reported ${budget.totalChangedFiles} changed files; Atlas retrieved ${budget.filesRetrieved} and retained bounded patch context for ${budget.filesWithPatchContext}.`,
        );
        if (budget.githubFileLimitReached) {
          limitations.push(
            "GitHub's pull-request files endpoint returned its maximum 3,000 files, so additional changed files are unavailable through this API.",
          );
        }
      }
    }
    if (lowConfidence || !resolvedCount) {
      limitations.push(
        "Entity resolution confidence is low; provide exact file or symbol anchors and rerun the analysis.",
      );
    }
    return limitations;
  }

  private summary(
    repository: ImpactRepositoryDetails,
    directCount: number,
    downstreamCount: number,
    unknownCount: number,
  ) {
    return `Atlas resolved ${directCount} candidate change anchor${directCount === 1 ? "" : "s"} in ${repository.owner}/${repository.name} and found ${downstreamCount} current or historical downstream relationship${downstreamCount === 1 ? "" : "s"}. ${unknownCount} gap${unknownCount === 1 ? "" : "s"} remain explicitly unverified.`;
  }

  private title(description: string) {
    const normalized = description.trim().replace(/\s+/g, " ");
    const shortened =
      normalized.length > 96 ? `${normalized.slice(0, 93).trim()}…` : normalized;
    return shortened.charAt(0).toUpperCase() + shortened.slice(1);
  }

  private matchesExplicitAnchor(
    result: SearchResult,
    anchors: string[],
  ): boolean {
    const path = result.citation.filePath.toLowerCase();
    const symbol = result.citation.symbol?.toLowerCase();
    return anchors.some((anchor) => {
      const normalized = anchor.trim().toLowerCase();
      return (
        normalized.length > 0 &&
        (path === normalized ||
          path.endsWith(normalized) ||
          symbol === normalized)
      );
    });
  }

  private isCodePath(path: string): boolean {
    return /\.(?:[cm]?[jt]sx?)$/i.test(path);
  }
}
