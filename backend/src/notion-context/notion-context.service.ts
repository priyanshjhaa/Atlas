import { BadRequestException, Inject, Injectable } from "@nestjs/common";
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
  NotionGenerationEvidence,
  NotionQuestionAnswer,
} from "./notion-context.types";

const FIRST_VISIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_CHANGED_DOCUMENTS = 100;
const MAX_CHANGED_SECTIONS = 8;
const MAX_EVIDENCE_ITEMS = 12;
const MAX_EVIDENCE_CHARACTERS = 10_000;

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
      documentId: null,
      resourceId: null,
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
