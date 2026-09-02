export type NotionContextGenerationStatus = "generated" | "fallback";

export interface NotionEditorAttribution {
  providerUserId: string;
  displayName: string | null;
  avatarUrl: string | null;
  kind: "person" | "bot" | "unknown";
}

export interface NotionContextCitation {
  id: string;
  provider: "notion";
  documentId: string | null;
  resourceId: string | null;
  title: string;
  url: string | null;
  sourceRevision: string;
  capturedAt: string;
  lastEditedAt: string | null;
  lastEditedBy: NotionEditorAttribution | null;
  heading: string | null;
  provenance: "notion_document_revision" | "indexed_notion_chunk";
}

export interface NotionChangedSection {
  heading: string;
  changeType: "added" | "changed" | "removed";
  excerpt: string;
}

export interface NotionCatchUpDocument {
  documentId: string;
  resourceId: string;
  changeType: "new" | "changed";
  title: string;
  url: string | null;
  currentRevision: string;
  previousRevision: string | null;
  changedAt: string;
  lastEditedAt: string | null;
  lastEditedBy: NotionEditorAttribution | null;
  lastSyncedAt: string | null;
  truncated: boolean;
  baselineUnavailable: boolean;
  changedSections: NotionChangedSection[];
  citationIds: string[];
}

export interface NotionCatchUpSnapshot {
  workspaceId: string;
  range: {
    from: string;
    through: string;
    firstVisit: boolean;
  };
  availability: "ready" | "not_connected" | "no_selected_sources";
  counts: {
    documents: number;
    newDocuments: number;
    changedDocuments: number;
  };
  documents: NotionCatchUpDocument[];
  citations: NotionContextCitation[];
  truncated: boolean;
}

export interface NotionCatchUpBriefing {
  id: string | null;
  status: NotionContextGenerationStatus;
  cached: boolean;
  headline: string;
  summary: string;
  highlights: Array<{ text: string; citationIds: string[] }>;
  limitations: string[];
  citationIds: string[];
  snapshot: NotionCatchUpSnapshot;
}

export interface NotionQuestionAnswer {
  status: NotionContextGenerationStatus;
  query: string;
  answer: string;
  lowConfidence: boolean;
  citationIds: string[];
  citations: NotionContextCitation[];
  suggestedQuestions: string[];
}

export interface NotionGenerationEvidence {
  id: string;
  title: string;
  excerpt: string;
  sourceRevision: string;
  url: string | null;
  heading: string | null;
}

export interface NotionDocumentRevisionSummary {
  id: string;
  sourceRevision: string;
  capturedAt: string;
  truncated: boolean;
  lastEditedBy: NotionEditorAttribution | null;
  isCurrent: boolean;
}

export interface NotionReviewDocumentSummary {
  documentId: string;
  resourceId: string;
  title: string;
  url: string | null;
  lastSyncedAt: string | null;
  currentRevision: string;
  reviewable: boolean;
  revisions: NotionDocumentRevisionSummary[];
}

export interface NotionReviewDocumentsResponse {
  availability: "ready" | "not_connected" | "no_selected_sources";
  documents: NotionReviewDocumentSummary[];
}

export interface NotionReviewFinding {
  text: string;
  citationIds: string[];
}

export interface NotionRevisionComparison {
  stats: {
    added: number;
    removed: number;
    unchanged: number;
  };
  truncated: boolean;
  rows: Array<{
    kind: "unchanged" | "added" | "removed" | "modified" | "collapsed";
    previousLine: number | null;
    currentLine: number | null;
    previousText: string | null;
    currentText: string | null;
    hiddenLines: number;
  }>;
}

export interface NotionDocumentReview {
  id: string;
  workspaceId: string;
  status: NotionContextGenerationStatus;
  cached: boolean;
  createdAt: string;
  document: {
    documentId: string | null;
    title: string;
    url: string | null;
    currentRevision: string;
    previousRevision: string;
    currentCapturedAt: string;
    previousCapturedAt: string;
    currentEditor: NotionEditorAttribution | null;
    previousEditor: NotionEditorAttribution | null;
    sourceAvailable: boolean;
  };
  whatChanged: NotionReviewFinding[];
  decisionsAdded: NotionReviewFinding[];
  decisionsRemoved: NotionReviewFinding[];
  decisionsModified: NotionReviewFinding[];
  contradictions: NotionReviewFinding[];
  potentiallySuperseded: NotionReviewFinding[];
  missingRationale: NotionReviewFinding[];
  unresolvedQuestions: NotionReviewFinding[];
  limitations: string[];
  citations: NotionContextCitation[];
  revisionComparison: NotionRevisionComparison | null;
}

export interface NotionDocumentReviewSummary {
  id: string;
  status: NotionContextGenerationStatus;
  createdAt: string;
  document: {
    documentId: string | null;
    title: string;
    url: string | null;
    currentRevision: string;
    previousRevision: string;
    sourceAvailable: boolean;
  };
  findingCount: number;
}

export type NotionGeneratedReview = Pick<
  NotionDocumentReview,
  | "whatChanged"
  | "decisionsAdded"
  | "decisionsRemoved"
  | "decisionsModified"
  | "contradictions"
  | "potentiallySuperseded"
  | "missingRationale"
  | "unresolvedQuestions"
  | "limitations"
>;

export type NotionGenerationResult<T> =
  | { status: "completed"; value: T }
  | { status: "disabled" }
  | { status: "failed" };

export interface NotionContextGenerationClient {
  generateBriefing(input: {
    evidence: NotionGenerationEvidence[];
    deterministicSummary: string;
  }): Promise<
    NotionGenerationResult<{
      headline: string;
      summary: string;
      highlights: Array<{ text: string; citationIds: string[] }>;
      limitations: string[];
    }>
  >;
  answerQuestion(input: {
    question: string;
    evidence: NotionGenerationEvidence[];
  }): Promise<
    NotionGenerationResult<{
      answer: string;
      citationIds: string[];
      suggestedQuestions: string[];
    }>
  >;
  reviewDocument(input: {
    documentTitle: string;
    previousRevision: string;
    currentRevision: string;
    deterministicChanges: NotionReviewFinding[];
    evidence: NotionGenerationEvidence[];
  }): Promise<NotionGenerationResult<NotionGeneratedReview>>;
}

export const NOTION_CONTEXT_GENERATION_CLIENT = Symbol(
  "NOTION_CONTEXT_GENERATION_CLIENT",
);
