import { Injectable, NotFoundException } from "@nestjs/common";
import { EmbeddingsService } from "./embeddings.service";
import { IntelligenceRepository } from "./intelligence.repository";
import { expandedQueryTerms } from "./query-terms";

interface RankedChunk {
  id: string;
  repositoryId: string;
  filePath: string;
  content: string;
  summary: string | null;
  metadata: Record<string, unknown>;
  vectorScore: number;
  lexicalMatches: number;
  graphScore: number;
  graphContext?: {
    seedEntityId: string;
    relatedEntityId: string;
    kind: string;
    classification: "observed" | "inferred";
    provenance: string;
    confidence: number;
  };
}

@Injectable()
export class RetrievalService {
  constructor(
    private readonly repository: IntelligenceRepository,
    private readonly embeddings: EmbeddingsService,
  ) {}

  async search(workspaceId: string, repositoryId: string, query: string) {
    if (!(await this.repository.repositoryExists(workspaceId, repositoryId))) {
      throw new NotFoundException("Repository not found.");
    }

    const terms = expandedQueryTerms(query);
    const [embedding] = await this.embeddings.embedTexts([
      [query, ...terms].join("\n"),
    ]);
    const [vectorRows, lexicalRows] = await Promise.all([
      this.repository.vectorCandidates(workspaceId, repositoryId, embedding),
      this.repository.lexicalCandidates(workspaceId, repositoryId, terms),
    ]);
    const ranked = new Map<string, RankedChunk>();

    for (const row of vectorRows) {
      ranked.set(row.id, {
        id: row.id,
        repositoryId,
        filePath: row.filePath,
        content: row.content,
        summary: row.summary,
        metadata: row.metadata,
        vectorScore: Math.max(0, 1 - Number(row.distance)),
        lexicalMatches: 0,
        graphScore: 0,
      });
    }
    for (const row of lexicalRows) {
      const haystack =
        `${row.filePath} ${row.summary ?? ""} ${row.content}`.toLowerCase();
      const matches = terms.filter((term) => haystack.includes(term)).length;
      if (!matches) continue;
      const existing = ranked.get(row.id);
      ranked.set(row.id, {
        id: row.id,
        repositoryId,
        filePath: row.filePath,
        content: row.content,
        summary: row.summary,
        metadata: row.metadata,
        vectorScore: existing?.vectorScore ?? 0,
        lexicalMatches: matches,
        graphScore: existing?.graphScore ?? 0,
        graphContext: existing?.graphContext,
      });
    }
    const seedPaths = [
      ...new Set(
        [...ranked.values()]
          .filter(
            (chunk) =>
              chunk.vectorScore >= 0.32 || chunk.lexicalMatches > 0,
          )
          .sort(
            (left, right) =>
              right.vectorScore +
              right.lexicalMatches * 0.08 -
              (left.vectorScore + left.lexicalMatches * 0.08),
          )
          .slice(0, 8)
          .map((chunk) => chunk.filePath),
      ),
    ];
    const graphRows = seedPaths.length
      ? await this.repository.graphContextCandidates(
          workspaceId,
          repositoryId,
          seedPaths,
        )
      : [];
    for (const row of graphRows) {
      const haystack =
        `${row.filePath} ${row.summary ?? ""} ${row.content}`.toLowerCase();
      const matches = terms.filter((term) => haystack.includes(term)).length;
      const graphScore =
        row.graphContext.classification === "observed"
          ? 0.12 + row.graphContext.confidence * 0.06
          : 0.06 + row.graphContext.confidence * 0.04;
      const existing = ranked.get(row.id);
      if (existing && existing.graphScore >= graphScore) continue;
      ranked.set(row.id, {
        id: row.id,
        repositoryId: row.repositoryId,
        filePath: row.filePath,
        content: row.content,
        summary: row.summary,
        metadata: row.metadata,
        vectorScore: existing?.vectorScore ?? 0,
        lexicalMatches: Math.max(
          existing?.lexicalMatches ?? 0,
          matches,
        ),
        graphScore,
        graphContext: row.graphContext,
      });
    }

    const results = [...ranked.values()]
      .map((chunk) => ({
        ...chunk,
        score: Math.min(
          1,
          chunk.vectorScore +
            Math.min(0.35, chunk.lexicalMatches * 0.08) +
            chunk.graphScore,
        ),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 16)
      .map((chunk) => ({
        id: chunk.id,
        score: chunk.score,
        lexicalMatches: chunk.lexicalMatches,
        reason:
          chunk.summary ??
          (chunk.graphContext
            ? `Related through ${chunk.graphContext.classification} ${chunk.graphContext.kind}.`
            : "Code context matched the search."),
        excerpt: chunk.content.slice(0, 1_000),
        graphContext: chunk.graphContext,
        citation: {
          repositoryId: chunk.repositoryId,
          filePath: chunk.filePath,
          lineStart:
            typeof chunk.metadata.lineStart === "number"
              ? chunk.metadata.lineStart
              : undefined,
          lineEnd:
            typeof chunk.metadata.lineEnd === "number"
              ? chunk.metadata.lineEnd
              : undefined,
          symbol:
            typeof chunk.metadata.symbol === "string"
              ? chunk.metadata.symbol
              : undefined,
          provenance: "indexed_source_chunk",
        },
      }));

    return {
      query,
      results,
      lowConfidence:
        !results.length ||
        ((results[0]?.score ?? 0) < 0.34 &&
          (results[0]?.lexicalMatches ?? 0) === 0),
    };
  }
}
