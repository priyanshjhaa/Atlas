import type {
  ImpactAnalysisStatus,
  ImpactFindingClassification,
  ImpactInputMode,
  ImpactEvidenceProvenance,
  ImpactRiskLevel,
} from "./impact.types";

export const IMPACT_EVIDENCE_PACKET_VERSION = "2" as const;

export interface ImpactEvidencePacketFinding {
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

export interface ImpactEvidencePacketCitation {
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

export interface ImpactEvidencePacket {
  packetVersion: typeof IMPACT_EVIDENCE_PACKET_VERSION;
  question: string;
  analysisMode: ImpactInputMode;
  analysisStatus: ImpactAnalysisStatus;
  atlasAssessment: {
    answer: string;
    executiveSummary: string;
    recommendations: string[];
    verificationPlan: string[];
  };
  repository: {
    id: string;
    owner: string;
    name: string;
  };
  sourceRevision: string;
  risk: {
    level: ImpactRiskLevel;
    score: number | null;
    reasons: string[];
  };
  directImpacts: ImpactEvidencePacketFinding[];
  downstreamImpacts: ImpactEvidencePacketFinding[];
  unknownImpacts: ImpactEvidencePacketFinding[];
  relationshipPaths: Array<{
    repository: string;
    filePath: string;
    hop: number;
  }>;
  evidence: ImpactEvidencePacketCitation[];
  limitations: string[];
}

export type ImpactEvidencePacketInsufficientReason =
  | "repository_mismatch"
  | "no_resolved_evidence"
  | "no_citable_evidence";

export type ImpactEvidencePacketBuildResult =
  | {
      status: "ready";
      packet: ImpactEvidencePacket;
      evidencePacketHash: string;
    }
  | {
      status: "insufficient_evidence";
      reason: ImpactEvidencePacketInsufficientReason;
    };

export interface ImpactEvidencePacketLimits {
  maxEvidenceItems: number;
  maxEvidenceCharacters: number;
  maxExcerptCharacters: number;
  maxQuestionCharacters: number;
  maxPacketCharacters: number;
  maxDirectImpacts: number;
  maxDownstreamImpacts: number;
  maxUnknownImpacts: number;
  maxRelationshipPaths: number;
  maxLimitations: number;
}
