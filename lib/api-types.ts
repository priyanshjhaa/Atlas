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
    relationshipsExtracted?: number;
    languages?: string[];
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

export interface AtlasWorkspaceData {
  me: AtlasMe;
  activeWorkspace: AtlasWorkspace;
  repositories: AtlasRepository[];
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

export type AtlasImpactExplanationState =
  | {
      status: "pending";
      schemaVersion: AtlasImpactExplanationSchemaVersion;
    }
  | {
      status: "completed";
      schemaVersion: AtlasImpactExplanationSchemaVersion;
      explanation: AtlasImpactExplanation;
    }
  | {
      status: "failed";
      schemaVersion: AtlasImpactExplanationSchemaVersion;
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
  provenance: "indexed_source_chunk" | "typescript_static_import";
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
    | "analysis_gap";
  evidenceIds: string[];
}

export interface AtlasImpactReport {
  id: string;
  workspaceId: string;
  repositoryId: string;
  requestedByUserId: string | null;
  sourceRevision: string;
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
  explanation?: AtlasImpactExplanationState;
  createdAt: string;
  updatedAt: string;
}
