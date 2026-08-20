export type AtlasWorkspaceRole = "owner" | "admin" | "member" | "viewer";

export interface AtlasApiUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface AtlasWorkspace {
  id: string;
  name: string;
  slug: string;
  role: AtlasWorkspaceRole;
  repositoryCount: number;
  onboardingCompletedAt: string | null;
}

export interface AtlasMe {
  user: AtlasApiUser;
  session: { id: string };
  workspaces: AtlasWorkspace[];
}

export interface AtlasRepository {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string | null;
  isPrivate: boolean;
  isActive: boolean;
  lastSyncedAt: string | null;
}

export interface AtlasGraphNode {
  id: string;
  repositoryId: string;
  repositoryOwner: string;
  repositoryName: string;
  entityType: string;
  stableKey: string;
  name: string;
  path: string | null;
  sourceRevision: string;
  metadata: Record<string, unknown>;
  isCurrent: boolean;
}

export interface AtlasGraphEdge {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  kind: string;
  classification: "observed" | "historical" | "inferred";
  provenance: string;
  confidence: number;
  sourceRevision: string;
  targetRevision: string;
  evidence: Record<string, unknown>;
  isCurrent: boolean;
  hop: number;
}

export interface AtlasGraph {
  rootEntityId: string;
  depth: number;
  direction: "incoming" | "outgoing" | "both";
  includeHistorical: boolean;
  includeInferred: boolean;
  truncated: boolean;
  nodes: AtlasGraphNode[];
  edges: AtlasGraphEdge[];
}

export interface AtlasArchitectureSnapshot {
  id: string;
  workspaceId: string;
  repositoryId: string;
  sourceRevision: string;
  summary: string;
  moduleMap: Record<string, unknown>;
  diagram: string;
  generatedAt: string;
}

export interface AtlasIntelligenceSearchResult {
  id: string;
  score: number;
  lexicalMatches: number;
  reason: string;
  excerpt: string;
  graphContext?: {
    seedEntityId: string;
    relatedEntityId: string;
    kind: string;
    classification: "observed" | "inferred";
    provenance: string;
    confidence: number;
  };
  citation: {
    repositoryId: string;
    filePath: string;
    lineStart?: number;
    lineEnd?: number;
    symbol?: string;
    provenance: "indexed_source_chunk";
  };
}

export interface AtlasIntelligenceSearchResponse {
  query: string;
  results: AtlasIntelligenceSearchResult[];
  lowConfidence: boolean;
}

export type AtlasWorkspaceIntelligenceSearchResult =
  | {
      id: string;
      provider: "github";
      score: number;
      lexicalMatches: number;
      title: string;
      excerpt: string;
      reason: string;
      freshness: null;
      citation: {
        provider: "github";
        repositoryId: string;
        repositoryName: string;
        repositoryOwner: string;
        filePath: string;
        lineStart: number | null;
        lineEnd: number | null;
        symbol: string | null;
        provenance: "indexed_source_chunk";
      };
    }
  | {
      id: string;
      provider: "notion";
      score: number;
      lexicalMatches: number;
      title: string;
      excerpt: string;
      reason: string;
      freshness: string | null;
      citation: {
        provider: "notion";
        title: string;
        url: string | null;
        sourceRevision: string;
        lastEditedAt: string | null;
        heading: string | null;
        provenance: "indexed_notion_chunk";
      };
    };

export interface AtlasWorkspaceIntelligenceSearchResponse {
  query: string;
  filters: {
    repositoryId: string | null;
    providers: Array<"github" | "notion">;
  };
  results: AtlasWorkspaceIntelligenceSearchResult[];
  lowConfidence: boolean;
}

export interface AtlasGitHubConnector {
  id: string;
  status: "pending" | "active" | "failed" | "revoked";
  installationId: string | null;
  configuration: {
    account?: string;
    accountType?: string;
    repositorySelection?: "all" | "selected";
  };
  createdAt: string;
  updatedAt: string;
}

export interface AtlasNotionConnector {
  id: string;
  status: "pending" | "active" | "failed" | "revoked";
  configuration: {
    workspaceId?: string;
    workspaceName?: string | null;
    workspaceIcon?: string | null;
    botId?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AtlasNotionResource {
  id: string;
  connectorId: string;
  providerResourceId: string;
  kind: "page" | "data_source" | "database";
  title: string;
  url: string | null;
  parentId: string | null;
  isSelected: boolean;
  isActive: boolean;
  lastEditedAt: string | null;
  lastSyncedAt: string | null;
}

export interface AtlasNotionContextCitation {
  id: string;
  provider: "notion";
  documentId: string | null;
  resourceId: string | null;
  title: string;
  url: string | null;
  sourceRevision: string;
  capturedAt: string;
  lastEditedAt: string | null;
  heading: string | null;
  provenance: "notion_document_revision" | "indexed_notion_chunk";
}

export interface AtlasNotionCatchUpSnapshot {
  workspaceId: string;
  range: { from: string; through: string; firstVisit: boolean };
  availability: "ready" | "not_connected" | "no_selected_sources";
  counts: {
    documents: number;
    newDocuments: number;
    changedDocuments: number;
  };
  documents: Array<{
    documentId: string;
    resourceId: string;
    changeType: "new" | "changed";
    title: string;
    url: string | null;
    currentRevision: string;
    previousRevision: string | null;
    changedAt: string;
    lastEditedAt: string | null;
    lastSyncedAt: string | null;
    truncated: boolean;
    baselineUnavailable: boolean;
    changedSections: Array<{
      heading: string;
      changeType: "added" | "changed" | "removed";
      excerpt: string;
    }>;
    citationIds: string[];
  }>;
  citations: AtlasNotionContextCitation[];
  truncated: boolean;
}

export interface AtlasNotionCatchUpBriefing {
  id: string | null;
  status: "generated" | "fallback";
  cached: boolean;
  headline: string;
  summary: string;
  highlights: Array<{ text: string; citationIds: string[] }>;
  limitations: string[];
  citationIds: string[];
  snapshot: AtlasNotionCatchUpSnapshot;
}

export interface AtlasNotionQuestionAnswer {
  status: "generated" | "fallback";
  query: string;
  answer: string;
  lowConfidence: boolean;
  citationIds: string[];
  citations: AtlasNotionContextCitation[];
  suggestedQuestions: string[];
}

export type AtlasSyncJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface AtlasSyncJob {
  id: string;
  repositoryId: string;
  repositoryOwner: string;
  repositoryName: string;
  status: AtlasSyncJobStatus;
  attempt: number;
  progress: number;
  stage: string;
  result: {
    outcome?: "updated" | "no_change";
    revision?: string;
    filesIndexed?: number;
    chunksCreated?: number;
    symbolsExtracted?: number;
    callsDetected?: number;
    relationshipsExtracted?: number;
    languages?: string[];
    history?: {
      baseRevision: string | null;
      headRevision: string;
      status: string;
      totalCommits: number;
      commitsCaptured: number;
      filesCaptured: number;
      commitsPersisted: number;
      filesPersisted: number;
      commitsTruncated: boolean;
      filesTruncated: boolean;
    };
    typeChecker?: {
      filesAnalyzed: number;
      importsResolved: number;
      pathAliasesResolved: number;
      workspaceImportsResolved: number;
      publicApiSymbols: number;
      diagnosticCount: number;
      configFilePath: string | null;
      configuredRootFiles: number;
      projectConfigPaths: string[];
      projectReferences: number;
    };
    workspace?: {
      packageCount: number;
      packageNames: string[];
      warningCount: number;
      relationshipsLinked: number;
      ambiguousDependencies: number;
      apiSymbolsLinked: number;
      apiCallsLinked: number;
      ambiguousApiImports: number;
    };
    embeddingProvider?: "local" | "openai";
  } | null;
  errorCode: string | null;
  errorMessage: string | null;
  cancelRequestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AtlasNotionSyncJob {
  id: string;
  connectorId: string;
  configuration: {
    workspaceName?: string | null;
  };
  status: AtlasSyncJobStatus;
  attempt: number;
  progress: number;
  stage: string;
  result: {
    outcome?: "updated" | "no_change";
    documentsUpdated?: number;
    documentsSkipped?: number;
    resourcesRemoved?: number;
    versionsCreated?: number;
    chunksCreated?: number;
    truncatedDocuments?: number;
  } | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AtlasWorkspaceData {
  me: AtlasMe;
  activeWorkspace: AtlasWorkspace;
  repositories: AtlasRepository[];
}

export type AtlasSourceReadinessStatus =
  | "disconnected"
  | "skipped"
  | "indexing"
  | "ready"
  | "stale"
  | "failed";

export interface AtlasWorkspaceOverview {
  generatedAt: string;
  staleAfterHours: number;
  readiness: {
    overall: "needs_setup" | "indexing" | "ready" | "attention";
    github: { status: AtlasSourceReadinessStatus; repositoriesConnected: number; repositoriesReady: number; lastSyncedAt: string | null };
    notion: { status: AtlasSourceReadinessStatus; resourcesSelected: number; documentsIndexed: number; lastSyncedAt: string | null };
  };
  jobs: { active: number; failed: number };
  intelligence: { repositoriesIndexed: number; codeFiles: number; codeChunks: number; relationships: number; notionDocuments: number; notionChunks: number };
  streams: {
    github: AtlasWorkspaceContextActivity[];
    notion: AtlasWorkspaceContextActivity[];
  };
  recentReports: Array<{ id: string; title: string; status: "complete" | "insufficient_evidence"; riskLevel: "insufficient" | "low" | "medium" | "high"; riskScore: number | null; unknownCount: number; repository: { id: string; owner: string; name: string }; createdAt: string }>;
  attention: Array<{ id: string; severity: "critical" | "warning" | "info"; title: string; detail: string; action: { label: string; href: string } }>;
}

export interface AtlasWorkspaceContextActivity {
  id: string;
  status: AtlasSyncJobStatus;
  title: string;
  summary: string;
  occurredAt: string;
}

export type AtlasImpactScope = "repository" | "workspace";

export const ATLAS_IMPACT_EXPLANATION_SCHEMA_VERSION = "1" as const;

export type AtlasImpactExplanationSchemaVersion =
  typeof ATLAS_IMPACT_EXPLANATION_SCHEMA_VERSION;

export interface AtlasImpactExplanationClaim {
  text: string;
  evidenceIds: string[];
}

export interface AtlasImpactExplanationImplementationStep {
  title: string;
  detail: string;
  evidenceIds: string[];
}

export interface AtlasImpactExplanationVerificationStep {
  text: string;
  evidenceIds: string[];
}

export interface AtlasImpactExplanation {
  schemaVersion: AtlasImpactExplanationSchemaVersion;
  executiveSummary: string;
  answer: string;
  claims: AtlasImpactExplanationClaim[];
  implementationSteps: AtlasImpactExplanationImplementationStep[];
  verificationSteps: AtlasImpactExplanationVerificationStep[];
  remainingQuestions: string[];
}

export type AtlasImpactExplanationFailureCode =
  | "configuration_error"
  | "provider_timeout"
  | "provider_authentication"
  | "provider_permission_denied"
  | "provider_rate_limited"
  | "provider_request_rejected"
  | "provider_unavailable"
  | "provider_refusal"
  | "provider_incomplete"
  | "invalid_provider_response"
  | "provider_error"
  | "invalid_explanation_schema"
  | "explanation_too_large"
  | "prompt_injection_content"
  | "unknown_evidence_id"
  | "unknown_file_path"
  | "unknown_symbol"
  | "unsupported_relationship"
  | "altered_risk"
  | "altered_confidence"
  | "altered_provenance"
  | "missing_unknown_impact"
  | "repository_mismatch"
  | "no_resolved_evidence"
  | "no_citable_evidence"
  | "generation_failed";

export interface AtlasImpactExplanationGenerationMetadata {
  provider: "openai" | "groq" | null;
  model: string | null;
  promptVersion: string;
  outputSchemaVersion: AtlasImpactExplanationSchemaVersion;
  evidencePacketHash: string | null;
  sourceRevision: string;
  generatedAt: string;
  latencyMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  validationStatus: "valid" | "invalid" | "not_run";
  failureCode: AtlasImpactExplanationFailureCode | null;
  deterministicFallback: boolean;
}

export type AtlasImpactExplanationState =
  | {
      status: "pending";
      schemaVersion: AtlasImpactExplanationSchemaVersion;
      evidencePacketHash?: string;
      promptVersion?: string;
      sourceRevision?: string;
      startedAt?: string;
    }
  | {
      status: "completed";
      schemaVersion: AtlasImpactExplanationSchemaVersion;
      explanation: AtlasImpactExplanation;
      metadata?: AtlasImpactExplanationGenerationMetadata;
    }
  | {
      status: "failed";
      schemaVersion: AtlasImpactExplanationSchemaVersion;
      failureCode?: AtlasImpactExplanationFailureCode;
      metadata?: AtlasImpactExplanationGenerationMetadata;
    }
  | {
      status: "disabled";
      schemaVersion: AtlasImpactExplanationSchemaVersion;
    };

export interface AtlasImpactCitation {
  id: string;
  repositoryId: string;
  repository: string;
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  symbol?: string;
  excerpt: string;
  provenance:
    | "indexed_source_chunk"
    | "typescript_static_import"
    | "package_manifest_dependency"
    | "typescript_public_api_import"
    | "typescript_public_api_call"
    | "historical_relationship";
  sourceRevision: string;
}

export interface AtlasImpactFinding {
  id: string;
  classification: "direct" | "downstream" | "unknown";
  kind: "File" | "Symbol" | "Consumer" | "Unknown";
  title: string;
  detail: string;
  repositoryId: string;
  repository: string;
  filePath?: string;
  symbol?: string;
  hop: number;
  confidence: number;
  provenance:
    | "indexed_source_chunk"
    | "typescript_static_import"
    | "package_manifest_dependency"
    | "typescript_public_api_import"
    | "typescript_public_api_call"
    | "historical_relationship"
    | "analysis_gap";
  evidenceIds: string[];
}

export interface AtlasImpactReport {
  id: string;
  workspaceId: string;
  repositoryId: string;
  requestedByUserId: string | null;
  sourceRevision: string;
  viewerFeedback?: {
    id: string;
    rating: "useful" | "not_useful";
    confirmedFindingIds: string[];
    missedImpact: string | null;
    comment: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  input: {
    mode: "planned" | "pull-request";
    repositoryId: string;
    description: string;
    scope: AtlasImpactScope;
    anchors: string[];
    pullRequest?: {
      number: number;
      title: string;
      url: string;
      author: string;
      baseRevision: string;
      headRevision: string;
      analysisBudget?: {
        totalChangedFiles: number;
        filesRetrieved: number;
        filesWithPatchContext: number;
        patchCharactersAnalyzed: number;
        githubFileLimitReached: boolean;
      };
      changedFiles: Array<{
        path: string;
        status: string;
        additions: number;
        deletions: number;
        patch?: string;
      }>;
    };
  };
  result: {
    status?: "complete" | "insufficient_evidence";
    title: string;
    answer?: string;
    executiveSummary: string;
    risk: {
      level: "insufficient" | "low" | "medium" | "high";
      score: number | null;
      reasons: string[];
    };
    repository: {
      id: string;
      owner: string;
      name: string;
      defaultBranch: string | null;
    };
    sourceRevision: string;
    scope: AtlasImpactScope;
    resolvedEntities: Array<{
      id: string;
      kind: "file" | "symbol";
      name: string;
      filePath: string;
      lineStart?: number;
      lineEnd?: number;
      confidence: number;
    }>;
    directImpacts: AtlasImpactFinding[];
    downstreamImpacts: AtlasImpactFinding[];
    unknownImpacts: AtlasImpactFinding[];
    evidence: AtlasImpactCitation[];
    documentationContext?: {
      status: "available" | "unavailable";
      evidence: Array<{
        id: string;
        provider: "notion";
        title: string;
        url: string | null;
        excerpt: string;
        sourceRevision: string;
        lastEditedAt: string | null;
        freshness: string | null;
        relevance: number;
      }>;
    };
    relationshipPath: Array<{
      repository: string;
      filePath: string;
      hop: number;
    }>;
    recommendations?: string[];
    verificationPlan: string[];
    limitations: string[];
    generatedAt: string;
  };
  /**
   * Generated explanation is a sibling of the deterministic result and is
   * optional so reports created before schema version 1 remain readable.
   */
  explanation?: AtlasImpactExplanationState | null;
  createdAt: string;
  updatedAt: string;
}

export interface AtlasPilotMetrics {
  feedback: {
    responses: number;
    useful: number;
    usefulnessRate: number | null;
    confirmedFindings: number;
    missedImpacts: number;
    averageTimeToFeedbackSeconds: number | null;
  };
  explanations: {
    completed: number;
    failed: number;
    modelFallbacks: number;
    deterministicFallbacks: number;
  };
  synchronization: {
    total: number;
    completed: number;
    failed: number;
    noChange: number;
    successRate: number | null;
  };
}
