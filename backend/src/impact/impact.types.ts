import type { ImpactExplanationState } from "./explanation.types";

export type ImpactScope = "repository" | "workspace";
export type ImpactInputMode = "planned" | "pull-request";
export type ImpactRiskLevel = "insufficient" | "low" | "medium" | "high";
export type ImpactAnalysisStatus = "complete" | "insufficient_evidence";
export type ImpactFindingClassification =
  | "direct"
  | "downstream"
  | "unknown";
export type ImpactObservedProvenance =
  | "indexed_source_chunk"
  | "typescript_static_import"
  | "package_manifest_dependency"
  | "typescript_public_api_import"
  | "typescript_public_api_call";
export type ImpactEvidenceProvenance =
  | ImpactObservedProvenance
  | "historical_relationship";

export type CreateImpactReportInput =
  | {
      mode: "planned";
      repositoryId: string;
      description: string;
      scope: ImpactScope;
      anchors: string[];
    }
  | {
      mode: "pull-request";
      repositoryId: string;
      pullRequestNumber: number;
      scope: ImpactScope;
    };

export interface ImpactReportInput {
  mode: ImpactInputMode;
  repositoryId: string;
  description: string;
  scope: ImpactScope;
  anchors: string[];
  pullRequest?: {
    number: number;
    title: string;
    body?: string;
    url: string;
    author: string;
    baseRevision: string;
    headRevision: string;
    analysisBudget: {
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
}

export interface ImpactCitation {
  id: string;
  repositoryId: string;
  repository: string;
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  symbol?: string;
  excerpt: string;
  provenance: ImpactEvidenceProvenance;
  sourceRevision: string;
}

export interface ImpactFinding {
  id: string;
  classification: ImpactFindingClassification;
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
    | ImpactEvidenceProvenance
    | "analysis_gap";
  evidenceIds: string[];
}

export interface ImpactResolvedEntity {
  id: string;
  kind: "file" | "symbol";
  name: string;
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  confidence: number;
}

export interface ImpactDocumentationEvidence {
  id: string;
  provider: "notion";
  title: string;
  url: string | null;
  excerpt: string;
  sourceRevision: string;
  lastEditedAt: string | null;
  freshness: string | null;
  relevance: number;
}

export interface ImpactDocumentationContext {
  status: "available" | "unavailable";
  evidence: ImpactDocumentationEvidence[];
}

export interface ImpactReportResult {
  status: ImpactAnalysisStatus;
  title: string;
  answer: string;
  executiveSummary: string;
  risk: {
    level: ImpactRiskLevel;
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
  scope: ImpactScope;
  resolvedEntities: ImpactResolvedEntity[];
  directImpacts: ImpactFinding[];
  downstreamImpacts: ImpactFinding[];
  unknownImpacts: ImpactFinding[];
  evidence: ImpactCitation[];
  documentationContext?: ImpactDocumentationContext;
  relationshipPath: Array<{
    repository: string;
    filePath: string;
    hop: number;
  }>;
  recommendations: string[];
  verificationPlan: string[];
  limitations: string[];
  generatedAt: string;
}

export interface StoredImpactReport {
  id: string;
  workspaceId: string;
  repositoryId: string;
  requestedByUserId: string | null;
  sourceRevision: string;
  input: ImpactReportInput;
  result: ImpactReportResult;
  /**
   * Kept outside result so generated text cannot replace deterministic
   * findings. It is optional for reports created before explanations exist.
   */
  explanation?: ImpactExplanationState | null;
  createdAt: Date;
  updatedAt: Date;
}
