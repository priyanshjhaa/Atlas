import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { RetrievalService } from "../intelligence/retrieval.service";
import { NotionContextRepository } from "./notion-context.repository";
import { NOTION_CONTEXT_GENERATION_CLIENT } from "./notion-context.types";
import type {
  NotionCatchUpBriefing,
  NotionCatchUpDocument,
  NotionCatchUpSnapshot,
  NotionChangedSection,
  NotionContextCitation,
  NotionContextGenerationClient,
  NotionDocumentReview,
  NotionDocumentReviewSummary,
  NotionGeneratedReview,
  NotionGenerationEvidence,
  NotionQuestionAnswer,
  NotionRevisionComparison,
  NotionReviewDocumentsResponse,
  NotionReviewFinding,
} from "./notion-context.types";

const FIRST_VISIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_CHANGED_DOCUMENTS = 100;
const MAX_CHANGED_SECTIONS = 8;
const MAX_EVIDENCE_ITEMS = 12;
const MAX_EVIDENCE_CHARACTERS = 10_000;
const MAX_DIFF_LINES = 600;

interface RevisionDiffOperation {
  kind: "unchanged" | "added" | "removed";
  previousLine: number | null;
  currentLine: number | null;
  text: string;
}

@Injectable()
export class NotionContextService {
  constructor(
    private readonly repository: NotionContextRepository,
    private readonly retrieval: RetrievalService,
    @Inject(NOTION_CONTEXT_GENERATION_CLIENT)
    private readonly generation: NotionContextGenerationClient,
  ) {}

  async catchUp(workspaceId: string, userId: string) {
    return this.buildSnapshot(workspaceId, userId, {
      through: new Date(),
    });
  }

  async createBriefing(
    workspaceId: string,
    userId: string,
    input: { snapshotFrom: string; snapshotThrough: string },
  ): Promise<NotionCatchUpBriefing> {
    const from = this.parseDate(input.snapshotFrom, "snapshotFrom");
    const through = this.parseDate(input.snapshotThrough, "snapshotThrough");
    const snapshot = await this.buildSnapshot(workspaceId, userId, {
      from,
      through,
    });
    const evidence = this.snapshotEvidence(snapshot);
    const evidenceHash = createHash("sha256")
      .update(JSON.stringify(evidence))
      .digest("hex");
    const cached = await this.repository.findBriefing({
      workspaceId,
      userId,
      rangeStart: new Date(snapshot.range.from),
      rangeEnd: new Date(snapshot.range.through),
      evidenceHash,
    });
    if (cached) {
      return {
        id: cached.id,
        status: cached.generationStatus as "generated" | "fallback",
        cached: true,
        ...(cached.result as Omit<
          NotionCatchUpBriefing,
          "id" | "status" | "cached" | "snapshot"
        >),
        snapshot,
      };
    }

    const fallback = this.fallbackBriefing(snapshot);
    let result = fallback;
    let status: "generated" | "fallback" = "fallback";
    if (evidence.length) {
      const generated = await this.generation.generateBriefing({
        evidence,
        deterministicSummary: this.deterministicSummary(snapshot),
      });
      if (
        generated.status === "completed" &&
        this.validBriefing(generated.value, new Set(evidence.map((item) => item.id)))
      ) {
        result = {
          ...generated.value,
          citationIds: [
            ...new Set(
              generated.value.highlights.flatMap((item) => item.citationIds),
            ),
          ],
        };
        status = "generated";
      }
    }
    const stored = await this.repository.saveBriefing({
      workspaceId,
      userId,
      rangeStart: new Date(snapshot.range.from),
      rangeEnd: new Date(snapshot.range.through),
      evidenceHash,
      generationStatus: status,
      result,
    });
    return {
      id: stored?.id ?? null,
      status,
      cached: false,
      ...result,
      snapshot,
    };
  }

  async acknowledge(
    workspaceId: string,
    userId: string,
    acknowledgedThroughValue: string,
  ) {
    const acknowledgedThrough = this.parseDate(
      acknowledgedThroughValue,
      "acknowledgedThrough",
    );
    if (acknowledgedThrough.getTime() > Date.now() + 5_000) {
      throw new BadRequestException(
        "The acknowledgement timestamp must come from a server snapshot.",
      );
    }
    const result = await this.repository.acknowledge(
      workspaceId,
      userId,
      acknowledgedThrough,
    );
    return {
      acknowledgedThrough: result.cursor?.acknowledgedThrough.toISOString(),
      advanced: result.advanced,
    };
  }

  async askQuestion(
    workspaceId: string,
    query: string,
  ): Promise<NotionQuestionAnswer> {
    const search = await this.retrieval.workspaceSearch(workspaceId, query, {
      providers: ["notion"],
    });
    const results = search.results
      .filter((item) => item.provider === "notion")
      .slice(0, 8);
    const citations: NotionContextCitation[] = results.map((item) => ({
      id: `notion-chunk:${item.id}`,
      provider: "notion",
      documentId: item.citation.documentId,
      resourceId: item.citation.resourceId,
      title: item.title,
      url: item.citation.url,
      sourceRevision: item.citation.sourceRevision,
      capturedAt: item.freshness ?? new Date().toISOString(),
      lastEditedAt: item.citation.lastEditedAt,
      heading: item.citation.heading,
      provenance: "indexed_notion_chunk",
    }));
    const evidence = this.boundEvidence(
      results.map((item, index) => ({
        id: citations[index].id,
        title: item.title,
        excerpt: item.excerpt,
        sourceRevision: item.citation.sourceRevision,
        url: item.citation.url,
        heading: item.citation.heading,
      })),
    );
    const fallback = this.fallbackQuestion(query, evidence, search.lowConfidence);
    if (!evidence.length || search.lowConfidence) {
      return { ...fallback, citations };
    }
    const generated = await this.generation.answerQuestion({
      question: query,
      evidence,
    });
    const validIds = new Set(evidence.map((item) => item.id));
    if (
      generated.status !== "completed" ||
      !this.validQuestion(generated.value, validIds)
    ) {
      return { ...fallback, citations };
    }
    return {
      status: "generated",
      query,
      answer: generated.value.answer,
      lowConfidence: false,
      citationIds: [...new Set(generated.value.citationIds)],
      citations,
      suggestedQuestions: generated.value.suggestedQuestions,
    };
  }

  async listReviewDocuments(
    workspaceId: string,
  ): Promise<NotionReviewDocumentsResponse> {
    const [availability, documents] = await Promise.all([
      this.repository.getAvailability(workspaceId),
      this.repository.listReviewDocuments(workspaceId),
    ]);
    return {
      availability: !availability.connected
        ? "not_connected"
        : availability.selectedResources === 0
          ? "no_selected_sources"
          : "ready",
      documents: documents.map((document) => ({
        documentId: document.documentId,
        resourceId: document.resourceId,
        title: document.title,
        url: document.url,
        lastSyncedAt: document.lastSyncedAt?.toISOString() ?? null,
        currentRevision: document.versions[0]?.sourceRevision ?? "unknown",
        reviewable: document.versions.length > 1,
        revisions: document.versions.map((version, index) => ({
          id: version.id,
          sourceRevision: version.sourceRevision,
          capturedAt: version.capturedAt.toISOString(),
          truncated: version.truncated,
          isCurrent: index === 0,
        })),
      })),
    };
  }

  async createDocumentReview(
    workspaceId: string,
    userId: string,
    input: { documentId: string; previousVersionId: string },
  ): Promise<NotionDocumentReview> {
    const source = await this.repository.getReviewInput(
      workspaceId,
      input.documentId,
      input.previousVersionId,
    );
    if (!source) {
      throw new BadRequestException(
        "The selected synchronized document revision is not available for review.",
      );
    }
    const currentCitationId = `notion-review-current:${source.current.id}`;
    const previousCitationId = `notion-review-previous:${source.previous.id}`;
    const fallback = this.fallbackDocumentReview(
      source.previous.content,
      source.current.content,
      currentCitationId,
      previousCitationId,
      source.current.truncated || source.previous.truncated,
    );
    const relatedResults = await this.relatedReviewEvidence(
      workspaceId,
      source.documentId,
      this.reviewRetrievalQuery(source.title, fallback),
    );
    const relatedCitationIds = new Set(
      relatedResults.map((item) => `notion-review-related:${item.id}`),
    );
    const revisionComparison = this.revisionComparison(
      source.previous.content,
      source.current.content,
    );
    const citations: NotionContextCitation[] = [
      {
        id: currentCitationId,
        provider: "notion",
        documentId: source.documentId,
        resourceId: source.resourceId,
        title: `${source.title} — current revision`,
        url: source.url,
        sourceRevision: source.current.sourceRevision,
        capturedAt: source.current.capturedAt.toISOString(),
        lastEditedAt: null,
        heading: null,
        provenance: "notion_document_revision",
      },
      {
        id: previousCitationId,
        provider: "notion",
        documentId: source.documentId,
        resourceId: source.resourceId,
        title: `${source.title} — previous revision`,
        url: source.url,
        sourceRevision: source.previous.sourceRevision,
        capturedAt: source.previous.capturedAt.toISOString(),
        lastEditedAt: null,
        heading: null,
        provenance: "notion_document_revision",
      },
      ...relatedResults.map((item) => ({
        id: `notion-review-related:${item.id}`,
        provider: "notion" as const,
        documentId: item.citation.documentId,
        resourceId: item.citation.resourceId,
        title: item.title,
        url: item.citation.url,
        sourceRevision: item.citation.sourceRevision,
        capturedAt: item.freshness ?? new Date().toISOString(),
        lastEditedAt: item.citation.lastEditedAt,
        heading: item.citation.heading,
        provenance: "indexed_notion_chunk" as const,
      })),
    ];
    const evidence = this.boundEvidence([
      {
        id: currentCitationId,
        title: `${source.title} — current revision`,
        excerpt: source.current.content,
        sourceRevision: source.current.sourceRevision,
        url: source.url,
        heading: null,
      },
      {
        id: previousCitationId,
        title: `${source.title} — previous revision`,
        excerpt: source.previous.content,
        sourceRevision: source.previous.sourceRevision,
        url: source.url,
        heading: null,
      },
      ...relatedResults.map((item) => ({
        id: `notion-review-related:${item.id}`,
        title: item.title,
        excerpt: item.excerpt,
        sourceRevision: item.citation.sourceRevision,
        url: item.citation.url,
        heading: item.citation.heading,
      })),
    ]);
    const evidenceHash = createHash("sha256")
      .update(
        JSON.stringify({
          current: source.current.contentHash,
          previous: source.previous.contentHash,
          related: relatedResults.map((item) => [
            item.id,
            item.citation.sourceRevision,
          ]),
        }),
      )
      .digest("hex");
    const comparison = {
      workspaceId,
      documentId: source.documentId,
      currentRevision: source.current.sourceRevision,
      previousRevision: source.previous.sourceRevision,
      evidenceHash,
    };
    const cached = await this.repository.findReview(comparison);
    if (cached) return this.formatReview(cached, true);

    let result: NotionGeneratedReview = fallback;
    let status: "generated" | "fallback" = "fallback";
    const generated = await this.generation.reviewDocument({
      documentTitle: source.title,
      previousRevision: source.previous.sourceRevision,
      currentRevision: source.current.sourceRevision,
      deterministicChanges: fallback.whatChanged,
      evidence,
    });
    if (
      generated.status === "completed" &&
      this.validReview(
        generated.value,
        new Set(evidence.map((item) => item.id)),
        relatedCitationIds,
        new Set([currentCitationId, previousCitationId]),
      )
    ) {
      result = generated.value;
      status = "generated";
    }
    const stored = await this.repository.saveReview({
      ...comparison,
      requestedByUserId: userId,
      currentVersionId: source.current.id,
      previousVersionId: source.previous.id,
      documentTitle: source.title,
      documentUrl: source.url,
      currentCapturedAt: source.current.capturedAt,
      previousCapturedAt: source.previous.capturedAt,
      generationStatus: status,
      result: { ...result, citations, revisionComparison },
    });
    if (!stored) {
      throw new BadRequestException("The document review could not be saved.");
    }
    return this.formatReview(stored, false);
  }

  async getDocumentReview(
    workspaceId: string,
    reviewId: string,
  ): Promise<NotionDocumentReview> {
    const review = await this.repository.getReview(workspaceId, reviewId);
    if (!review) throw new NotFoundException("Document review not found.");
    return this.formatReview(review, true);
  }

  async listDocumentReviews(
    workspaceId: string,
  ): Promise<NotionDocumentReviewSummary[]> {
    const reviews = await this.repository.listReviews(workspaceId);
    return reviews.map((review) => {
      const formatted = this.formatReview(review, true);
      return {
        id: formatted.id,
        status: formatted.status,
        createdAt: formatted.createdAt,
        document: {
          documentId: formatted.document.documentId,
          title: formatted.document.title,
          url: formatted.document.url,
          currentRevision: formatted.document.currentRevision,
          previousRevision: formatted.document.previousRevision,
          sourceAvailable: formatted.document.sourceAvailable,
        },
        findingCount: [
          formatted.whatChanged,
          formatted.decisionsAdded,
          formatted.decisionsRemoved,
          formatted.decisionsModified,
          formatted.contradictions,
          formatted.potentiallySuperseded,
          formatted.missingRationale,
          formatted.unresolvedQuestions,
        ].reduce((total, findings) => total + findings.length, 0),
      };
    });
  }

  private async buildSnapshot(
    workspaceId: string,
    userId: string,
    requested: { from?: Date; through: Date },
  ): Promise<NotionCatchUpSnapshot> {
    const now = new Date();
    if (requested.through.getTime() > now.getTime() + 5_000) {
      throw new BadRequestException("The snapshot timestamp is invalid.");
    }
    const through = new Date(Math.min(requested.through.getTime(), now.getTime()));
    const [cursor, availability] = await Promise.all([
      this.repository.getCursor(workspaceId, userId),
      this.repository.getAvailability(workspaceId),
    ]);
    const firstVisit = !cursor;
    const minimumStart = cursor?.acknowledgedThrough ?? new Date(
      through.getTime() - FIRST_VISIT_WINDOW_MS,
    );
    const from = requested.from && requested.from > minimumStart
      ? requested.from
      : minimumStart;
    if (from > through) {
      throw new BadRequestException("The snapshot range is invalid.");
    }
    const changes = await this.repository.listEligibleChanges(
      workspaceId,
      from,
      through,
      MAX_CHANGED_DOCUMENTS,
    );
    const documents: NotionCatchUpDocument[] = [];
    const citations: NotionContextCitation[] = [];
    for (const document of changes.documents) {
      const current = document.versions.at(-1);
      if (!current) continue;
      const baseline = [...document.versions]
        .reverse()
        .find((version) => version.capturedAt <= from);
      const changeType = document.documentCreatedAt > from ? "new" : "changed";
      const citationId = `notion-revision:${current.id}`;
      const changedSections = this.changedSections(
        baseline?.content ?? "",
        current.content,
        changeType === "new",
      );
      citations.push({
        id: citationId,
        provider: "notion",
        documentId: document.documentId,
        resourceId: document.resourceId,
        title: document.title,
        url: document.url,
        sourceRevision: current.sourceRevision,
        capturedAt: current.capturedAt.toISOString(),
        lastEditedAt: document.lastEditedAt?.toISOString() ?? null,
        heading: changedSections[0]?.heading ?? null,
        provenance: "notion_document_revision",
      });
      documents.push({
        documentId: document.documentId,
        resourceId: document.resourceId,
        changeType,
        title: document.title,
        url: document.url,
        currentRevision: current.sourceRevision,
        previousRevision: baseline?.sourceRevision ?? null,
        changedAt: document.latestChangeAt.toISOString(),
        lastEditedAt: document.lastEditedAt?.toISOString() ?? null,
        lastSyncedAt: document.lastSyncedAt?.toISOString() ?? null,
        truncated: current.truncated,
        baselineUnavailable: changeType === "changed" && !baseline,
        changedSections,
        citationIds: [citationId],
      });
    }
    const snapshotAvailability = !availability.connected
      ? "not_connected"
      : availability.selectedResources === 0
        ? "no_selected_sources"
        : "ready";
    return {
      workspaceId,
      range: {
        from: from.toISOString(),
        through: through.toISOString(),
        firstVisit,
      },
      availability: snapshotAvailability,
      counts: {
        documents: documents.length,
        newDocuments: documents.filter((item) => item.changeType === "new").length,
        changedDocuments: documents.filter((item) => item.changeType === "changed").length,
      },
      documents,
      citations,
      truncated: changes.truncated,
    };
  }

  private changedSections(
    previousContent: string,
    currentContent: string,
    isNew: boolean,
  ): NotionChangedSection[] {
    const previous = this.markdownSections(previousContent);
    const current = this.markdownSections(currentContent);
    const changes: NotionChangedSection[] = [];
    for (const [heading, content] of current) {
      const before = previous.get(heading);
      if (isNew || before === undefined) {
        changes.push({ heading, changeType: "added", excerpt: this.excerpt(content) });
      } else if (this.normalize(before) !== this.normalize(content)) {
        changes.push({ heading, changeType: "changed", excerpt: this.excerpt(content) });
      }
    }
    if (!isNew) {
      for (const [heading, content] of previous) {
        if (!current.has(heading)) {
          changes.push({ heading, changeType: "removed", excerpt: this.excerpt(content) });
        }
      }
    }
    return changes.slice(0, MAX_CHANGED_SECTIONS);
  }

  private markdownSections(markdown: string) {
    const sections = new Map<string, string>();
    let heading = "Overview";
    let lines: string[] = [];
    const flush = () => {
      const content = lines.join("\n").trim();
      if (content) sections.set(heading, content);
      lines = [];
    };
    for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
      const match = line.match(/^#{1,6}\s+(.+)$/);
      if (match?.[1]) {
        flush();
        heading = match[1].trim().slice(0, 200);
      } else {
        lines.push(line);
      }
    }
    flush();
    return sections;
  }

  private snapshotEvidence(snapshot: NotionCatchUpSnapshot) {
    return this.boundEvidence(
      snapshot.documents.map((document) => ({
        id: document.citationIds[0],
        title: document.title,
        excerpt: document.changedSections
          .map((section) => `${section.changeType}: ${section.heading}\n${section.excerpt}`)
          .join("\n\n"),
        sourceRevision: document.currentRevision,
        url: document.url,
        heading: document.changedSections[0]?.heading ?? null,
      })),
    );
  }

  private boundEvidence(evidence: NotionGenerationEvidence[]) {
    const bounded: NotionGenerationEvidence[] = [];
    let characters = 0;
    for (const item of evidence.slice(0, MAX_EVIDENCE_ITEMS)) {
      const remaining = MAX_EVIDENCE_CHARACTERS - characters;
      if (remaining <= 0) break;
      const excerpt = item.excerpt.slice(0, Math.min(2_000, remaining));
      bounded.push({ ...item, excerpt });
      characters += excerpt.length;
    }
    return bounded;
  }

  private fallbackBriefing(snapshot: NotionCatchUpSnapshot) {
    const documents = snapshot.documents.slice(0, 6);
    return {
      headline: snapshot.counts.documents
        ? `${snapshot.counts.documents} Notion ${snapshot.counts.documents === 1 ? "document needs" : "documents need"} your attention`
        : "You are caught up on synchronized Notion context",
      summary: this.deterministicSummary(snapshot),
      highlights: documents.map((document) => ({
        text: `${document.title} was ${document.changeType === "new" ? "added" : "updated"}${document.changedSections[0] ? ` in ${document.changedSections[0].heading}` : ""}.`,
        citationIds: document.citationIds,
      })),
      limitations: [
        ...(snapshot.truncated ? ["More changed documents exist outside this bounded snapshot."] : []),
        ...(documents.some((item) => item.baselineUnavailable)
          ? ["Some earlier revisions were outside the retained version window."]
          : []),
      ],
      citationIds: documents.flatMap((document) => document.citationIds),
    };
  }

  private deterministicSummary(snapshot: NotionCatchUpSnapshot) {
    if (!snapshot.counts.documents) {
      return "No new or changed selected Notion documents were synchronized in this catch-up range.";
    }
    return `${snapshot.counts.newDocuments} new and ${snapshot.counts.changedDocuments} changed Notion documents were synchronized in this catch-up range.`;
  }

  private fallbackQuestion(
    query: string,
    evidence: NotionGenerationEvidence[],
    lowConfidence: boolean,
  ): Omit<NotionQuestionAnswer, "citations"> {
    if (!evidence.length) {
      return {
        status: "fallback",
        query,
        answer: "Atlas could not find synchronized Notion evidence that answers this question.",
        lowConfidence: true,
        citationIds: [],
        suggestedQuestions: [],
      };
    }
    return {
      status: "fallback",
      query,
      answer: evidence
        .slice(0, 3)
        .map((item) => `${item.title}: ${this.excerpt(item.excerpt, 420)}`)
        .join("\n\n"),
      lowConfidence,
      citationIds: evidence.slice(0, 3).map((item) => item.id),
      suggestedQuestions: [],
    };
  }

  private validBriefing(
    value: {
      highlights: Array<{ citationIds: string[] }>;
      headline: string;
      summary: string;
    },
    validIds: Set<string>,
  ) {
    return (
      !this.instructionLike(`${value.headline}\n${value.summary}`) &&
      value.highlights.every(
        (item) =>
          item.citationIds.length > 0 &&
          item.citationIds.every((id) => validIds.has(id)),
      )
    );
  }

  private validQuestion(
    value: { answer: string; citationIds: string[] },
    validIds: Set<string>,
  ) {
    return (
      value.citationIds.length > 0 &&
      value.citationIds.every((id) => validIds.has(id)) &&
      !this.instructionLike(value.answer)
    );
  }

  private fallbackDocumentReview(
    previousContent: string,
    currentContent: string,
    currentCitationId: string,
    previousCitationId: string,
    truncated: boolean,
  ): NotionGeneratedReview {
    const changes = this.changedSections(previousContent, currentContent, false);
    const finding = (text: string, citationIds: string[]): NotionReviewFinding => ({
      text,
      citationIds,
    });
    const whatChanged = changes.map((section) =>
      finding(
        section.changeType === "added"
          ? `${section.heading} was added in the current revision.`
          : section.changeType === "removed"
            ? `${section.heading} was removed from the current revision.`
            : `${section.heading} changed between the selected revisions.`,
        section.changeType === "added"
          ? [currentCitationId]
          : section.changeType === "removed"
            ? [previousCitationId]
            : [previousCitationId, currentCitationId],
      ),
    );
    const previousDecisions = this.decisionStatements(previousContent);
    const currentDecisions = this.decisionStatements(currentContent);
    const previousKeys = new Set(previousDecisions.map((item) => this.normalize(item)));
    const currentKeys = new Set(currentDecisions.map((item) => this.normalize(item)));
    const decisionsAdded = currentDecisions
      .filter((item) => !previousKeys.has(this.normalize(item)))
      .slice(0, 8)
      .map((item) => finding(this.safeReviewText(item), [currentCitationId]));
    const decisionsRemoved = previousDecisions
      .filter((item) => !currentKeys.has(this.normalize(item)))
      .slice(0, 8)
      .map((item) => finding(this.safeReviewText(item), [previousCitationId]));
    const decisionsModified = changes
      .filter(
        (section) =>
          section.changeType === "changed" &&
          /(decision|policy|requirement|guidance|standard)/i.test(section.heading),
      )
      .map((section) =>
        finding(
          `${section.heading} contains modified decision or guidance text.`,
          [previousCitationId, currentCitationId],
        ),
      );
    const unresolvedQuestions = currentContent
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
      .filter((line) => line.endsWith("?") || /\b(TODO|TBD)\b/i.test(line))
      .slice(0, 8)
      .map((line) => finding(this.safeReviewText(line), [currentCitationId]));
    const missingRationale =
      currentDecisions.length > 0 &&
      !/\b(because|rationale|reason|why|trade-?off)\b/i.test(currentContent)
        ? [
            finding(
              "The current revision contains decision-like guidance without an explicit rationale section or rationale language.",
              [currentCitationId],
            ),
          ]
        : [];
    return {
      whatChanged,
      decisionsAdded,
      decisionsRemoved,
      decisionsModified,
      contradictions: [],
      potentiallySuperseded: changes
        .filter((section) => section.changeType === "removed")
        .map((section) =>
          finding(
            `${section.heading} may be superseded because it no longer appears in the current revision.`,
            [previousCitationId, currentCitationId],
          ),
        ),
      missingRationale,
      unresolvedQuestions,
      limitations: [
        "This deterministic review reports verifiable revision differences; contradiction analysis was unavailable.",
        ...(truncated
          ? ["At least one synchronized revision was truncated before review."]
          : []),
      ],
    };
  }

  private reviewRetrievalQuery(
    documentTitle: string,
    review: NotionGeneratedReview,
  ) {
    const findings = [
      ...review.whatChanged,
      ...review.decisionsAdded,
      ...review.decisionsRemoved,
      ...review.decisionsModified,
    ];
    return [documentTitle, ...findings.map((item) => item.text)]
      .join("\n")
      .slice(0, 1_500);
  }

  private revisionComparison(
    previousContent: string,
    currentContent: string,
  ): NotionRevisionComparison {
    const previousAll = previousContent.replace(/\r\n?/g, "\n").split("\n");
    const currentAll = currentContent.replace(/\r\n?/g, "\n").split("\n");
    const previous = previousAll.slice(0, MAX_DIFF_LINES);
    const current = currentAll.slice(0, MAX_DIFF_LINES);
    const matrix = Array.from(
      { length: previous.length + 1 },
      () => new Uint16Array(current.length + 1),
    );
    for (let left = previous.length - 1; left >= 0; left -= 1) {
      for (let right = current.length - 1; right >= 0; right -= 1) {
        matrix[left][right] =
          previous[left] === current[right]
            ? matrix[left + 1][right + 1] + 1
            : Math.max(matrix[left + 1][right], matrix[left][right + 1]);
      }
    }

    const operations: RevisionDiffOperation[] = [];
    let left = 0;
    let right = 0;
    while (left < previous.length && right < current.length) {
      if (previous[left] === current[right]) {
        operations.push({
          kind: "unchanged",
          previousLine: left + 1,
          currentLine: right + 1,
          text: previous[left],
        });
        left += 1;
        right += 1;
      } else if (matrix[left + 1][right] >= matrix[left][right + 1]) {
        operations.push({
          kind: "removed",
          previousLine: left + 1,
          currentLine: null,
          text: previous[left],
        });
        left += 1;
      } else {
        operations.push({
          kind: "added",
          previousLine: null,
          currentLine: right + 1,
          text: current[right],
        });
        right += 1;
      }
    }
    while (left < previous.length) {
      operations.push({
        kind: "removed",
        previousLine: left + 1,
        currentLine: null,
        text: previous[left],
      });
      left += 1;
    }
    while (right < current.length) {
      operations.push({
        kind: "added",
        previousLine: null,
        currentLine: right + 1,
        text: current[right],
      });
      right += 1;
    }

    return {
      stats: {
        added: operations.filter((item) => item.kind === "added").length,
        removed: operations.filter((item) => item.kind === "removed").length,
        unchanged: operations.filter((item) => item.kind === "unchanged").length,
      },
      truncated:
        previousAll.length > MAX_DIFF_LINES || currentAll.length > MAX_DIFF_LINES,
      rows: this.alignRevisionDiff(operations),
    };
  }

  private alignRevisionDiff(operations: RevisionDiffOperation[]) {
    const rows: NotionRevisionComparison["rows"] = [];
    let index = 0;
    while (index < operations.length) {
      if (operations[index].kind === "unchanged") {
        const start = index;
        while (
          index < operations.length &&
          operations[index].kind === "unchanged"
        ) {
          index += 1;
        }
        const unchanged = operations.slice(start, index);
        const visible =
          unchanged.length > 8
            ? [
                ...unchanged.slice(0, 3),
                null,
                ...unchanged.slice(-3),
              ]
            : unchanged;
        for (const operation of visible) {
          if (!operation) {
            rows.push({
              kind: "collapsed",
              previousLine: null,
              currentLine: null,
              previousText: null,
              currentText: null,
              hiddenLines: unchanged.length - 6,
            });
          } else {
            rows.push({
              kind: "unchanged",
              previousLine: operation.previousLine,
              currentLine: operation.currentLine,
              previousText: operation.text,
              currentText: operation.text,
              hiddenLines: 0,
            });
          }
        }
        continue;
      }

      const start = index;
      while (
        index < operations.length &&
        operations[index].kind !== "unchanged"
      ) {
        index += 1;
      }
      const changed = operations.slice(start, index);
      const removed = changed.filter((item) => item.kind === "removed");
      const added = changed.filter((item) => item.kind === "added");
      for (let offset = 0; offset < Math.max(removed.length, added.length); offset += 1) {
        const before = removed[offset];
        const after = added[offset];
        rows.push({
          kind: before && after ? "modified" : before ? "removed" : "added",
          previousLine: before?.previousLine ?? null,
          currentLine: after?.currentLine ?? null,
          previousText: before?.text ?? null,
          currentText: after?.text ?? null,
          hiddenLines: 0,
        });
      }
    }
    return rows;
  }

  private async relatedReviewEvidence(
    workspaceId: string,
    documentId: string,
    query: string,
  ) {
    try {
      const search = await this.retrieval.workspaceSearch(workspaceId, query, {
        providers: ["notion"],
        excludeNotionDocumentId: documentId,
      });
      if (search.lowConfidence) return [];
      return search.results
        .filter((item) => item.provider === "notion")
        .filter((item) => item.citation.documentId !== documentId)
        .slice(0, 8);
    } catch {
      return [];
    }
  }

  private decisionStatements(content: string) {
    return content
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
      .filter(
        (line) =>
          line.length >= 12 &&
          line.length <= 600 &&
          /\b(decid(?:e|ed)|must|shall|will|approved|adopt(?:ed)?|require(?:d|s)?)\b/i.test(
            line,
          ),
      )
      .slice(0, 20);
  }

  private safeReviewText(value: string) {
    return this.instructionLike(value)
      ? "Potential instruction-like text changed; inspect the cited Notion revision directly."
      : this.excerpt(value, 600);
  }

  private validReview(
    value: NotionGeneratedReview,
    validIds: Set<string>,
    relatedIds: Set<string>,
    primaryRevisionIds: Set<string>,
  ) {
    const findings = [
      ...value.whatChanged,
      ...value.decisionsAdded,
      ...value.decisionsRemoved,
      ...value.decisionsModified,
      ...value.contradictions,
      ...value.potentiallySuperseded,
      ...value.missingRationale,
      ...value.unresolvedQuestions,
    ];
    return (
      value.contradictions.every(
        (item) =>
          item.citationIds.some((id) => relatedIds.has(id)) &&
          item.citationIds.some((id) => primaryRevisionIds.has(id)),
      ) &&
      findings.every(
        (item) =>
          item.citationIds.length > 0 &&
          item.citationIds.every((id) => validIds.has(id)) &&
          !this.instructionLike(item.text),
      ) && value.limitations.every((item) => !this.instructionLike(item))
    );
  }

  private formatReview(
    row: {
      id: string;
      workspaceId: string;
      documentId: string | null;
      documentTitle: string;
      documentUrl: string | null;
      currentRevision: string;
      previousRevision: string;
      currentCapturedAt: Date;
      previousCapturedAt: Date;
      generationStatus: string;
      result: Record<string, unknown>;
      createdAt: Date;
    },
    cached: boolean,
  ): NotionDocumentReview {
    const result = row.result as unknown as NotionGeneratedReview & {
      citations: NotionContextCitation[];
      revisionComparison?: NotionRevisionComparison;
    };
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      status: row.generationStatus as "generated" | "fallback",
      cached,
      createdAt: row.createdAt.toISOString(),
      document: {
        documentId: row.documentId,
        title: row.documentTitle,
        url: row.documentUrl,
        currentRevision: row.currentRevision,
        previousRevision: row.previousRevision,
        currentCapturedAt: row.currentCapturedAt.toISOString(),
        previousCapturedAt: row.previousCapturedAt.toISOString(),
        sourceAvailable: row.documentId !== null,
      },
      whatChanged: result.whatChanged ?? [],
      decisionsAdded: result.decisionsAdded ?? [],
      decisionsRemoved: result.decisionsRemoved ?? [],
      decisionsModified: result.decisionsModified ?? [],
      contradictions: result.contradictions ?? [],
      potentiallySuperseded: result.potentiallySuperseded ?? [],
      missingRationale: result.missingRationale ?? [],
      unresolvedQuestions: result.unresolvedQuestions ?? [],
      limitations: result.limitations ?? [],
      citations: result.citations ?? [],
      revisionComparison: result.revisionComparison ?? null,
    };
  }

  private instructionLike(value: string) {
    return /(ignore (all|any|the|previous) instructions|reveal (the )?system prompt|act as (an?|the)|execute (this|the following) command)/i.test(
      value,
    );
  }

  private excerpt(value: string, maximum = 700) {
    return value.replace(/\s+/g, " ").trim().slice(0, maximum);
  }

  private normalize(value: string) {
    return value.replace(/\s+/g, " ").trim().toLowerCase();
  }

  private parseDate(value: string, field: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid timestamp.`);
    }
    return parsed;
  }
}
