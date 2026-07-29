import { Injectable, NotFoundException } from "@nestjs/common";
import { EmbeddingsService } from "./embeddings.service";
import { IntelligenceRepository } from "./intelligence.repository";
import { expandedQueryTerms } from "./query-terms";

interface RankedChunk {
  id: string;
  filePath: string;
  content: string;
  summary: string | null;
  metadata: Record<string, unknown>;
  vectorScore: number;
  lexicalMatches: number;
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
        filePath: row.filePath,
        content: row.content,
        summary: row.summary,
        metadata: row.metadata,
        vectorScore: Math.max(0, 1 - Number(row.distance)),
        lexicalMatches: 0,
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
        filePath: row.filePath,
        content: row.content,
        summary: row.summary,
        metadata: row.metadata,
        vectorScore: existing?.vectorScore ?? 0,
        lexicalMatches: matches,
      });
    }

    const results = [...ranked.values()]
      .map((chunk) => ({
        ...chunk,
        score: Math.min(
          1,
          chunk.vectorScore + Math.min(0.35, chunk.lexicalMatches * 0.08),
        ),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 16)
      .map((chunk) => ({
        id: chunk.id,
        score: chunk.score,
        lexicalMatches: chunk.lexicalMatches,
        reason: chunk.summary ?? "Code context matched the search.",
        excerpt: chunk.content.slice(0, 1_000),
        citation: {
          repositoryId,
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
