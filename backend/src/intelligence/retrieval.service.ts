import { Injectable, NotFoundException } from "@nestjs/common";
import { EmbeddingsService } from "./embeddings.service";
import { IntelligenceRepository } from "./intelligence.repository";
import { expandedQueryTerms } from "./query-terms";

export type WorkspaceSearchProvider = "github" | "notion";

interface WorkspaceSearchOptions {
  repositoryId?: string;
  providers?: WorkspaceSearchProvider[];
  excludeNotionDocumentId?: string;
}

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

  async workspaceSearch(
    workspaceId: string,
    query: string,
    options: WorkspaceSearchOptions = {},
  ) {
    if (
      options.repositoryId &&
      !(await this.repository.repositoryExists(
        workspaceId,
        options.repositoryId,
      ))
    ) {
      throw new NotFoundException("Repository not found.");
    }

    const providers = new Set<WorkspaceSearchProvider>(
      options.providers?.length ? options.providers : ["github", "notion"],
    );
    const terms = expandedQueryTerms(query);
    const [embedding] = await this.embeddings.embedTexts([
      [query, ...terms].join("\n"),
    ]);
    const [codeVectorRows, codeLexicalRows, notionVectorRows, notionLexicalRows] =
      await Promise.all([
        providers.has("github")
          ? this.repository.workspaceVectorCandidates(
              workspaceId,
              options.repositoryId,
              embedding,
            )
          : [],
        providers.has("github")
          ? this.repository.workspaceLexicalCandidates(
              workspaceId,
              options.repositoryId,
              terms,
            )
          : [],
        providers.has("notion")
          ? this.repository.notionVectorCandidates(
              workspaceId,
              embedding,
              options.excludeNotionDocumentId,
            )
          : [],
        providers.has("notion")
          ? this.repository.notionLexicalCandidates(
              workspaceId,
              terms,
              options.excludeNotionDocumentId,
            )
          : [],
      ]);

    const results = new Map<
      string,
      {
        provider: WorkspaceSearchProvider;
        vectorScore: number;
        lexicalMatches: number;
        row: Record<string, unknown>;
      }
    >();
    const add = (
      provider: WorkspaceSearchProvider,
      row: Record<string, unknown> & { id: string },
      vector: boolean,
      haystack: string,
    ) => {
      const lexicalMatches = terms.filter((term) =>
        haystack.toLowerCase().includes(term),
      ).length;
      const existing = results.get(`${provider}:${row.id}`);
      results.set(`${provider}:${row.id}`, {
        provider,
        row,
        vectorScore: vector
          ? Math.max(0, 1 - Number(row.distance ?? 1))
          : (existing?.vectorScore ?? 0),
        lexicalMatches: Math.max(
          existing?.lexicalMatches ?? 0,
          lexicalMatches,
        ),
      });
    };

    for (const row of codeVectorRows) {
      add(
        "github",
        row,
        true,
        `${row.filePath} ${row.summary ?? ""} ${row.content}`,
      );
    }
    for (const row of codeLexicalRows) {
      add(
        "github",
        row,
        false,
        `${row.filePath} ${row.summary ?? ""} ${row.content}`,
      );
    }
    for (const row of notionVectorRows) {
      add("notion", row, true, `${row.title} ${row.content}`);
    }
    for (const row of notionLexicalRows) {
      add("notion", row, false, `${row.title} ${row.content}`);
    }

    const ranked = [...results.values()]
      .map((candidate) => ({
        ...candidate,
        score: Math.min(
          1,
          candidate.vectorScore +
            Math.min(0.36, candidate.lexicalMatches * 0.09),
        ),
      }))
      .filter(
        (candidate) =>
          candidate.vectorScore >= 0.2 || candidate.lexicalMatches > 0,
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, 20)
      .map((candidate) => {
        if (candidate.provider === "notion") {
          const row = candidate.row as unknown as Awaited<
            ReturnType<IntelligenceRepository["notionVectorCandidates"]>
          >[number];
          return {
            id: row.id,
            provider: "notion" as const,
            score: candidate.score,
            lexicalMatches: candidate.lexicalMatches,
            title: row.title,
            excerpt: row.content.slice(0, 1_000),
            reason: candidate.lexicalMatches
              ? "Notion documentation directly matched the search."
              : "Semantically related Notion documentation.",
            freshness: row.lastSyncedAt?.toISOString() ?? null,
            citation: {
              provider: "notion" as const,
              documentId: row.documentId,
              resourceId: row.resourceId,
              title: row.title,
              url: row.url,
              sourceRevision: row.sourceRevision,
              lastEditedAt: row.lastEditedAt?.toISOString() ?? null,
              lastEditedBy: row.lastEditedBy,
              heading:
                typeof row.metadata.heading === "string"
                  ? row.metadata.heading
                  : null,
              provenance: "indexed_notion_chunk" as const,
            },
          };
        }
        const row = candidate.row as unknown as Awaited<
          ReturnType<IntelligenceRepository["workspaceVectorCandidates"]>
        >[number];
        return {
          id: row.id,
          provider: "github" as const,
          score: candidate.score,
          lexicalMatches: candidate.lexicalMatches,
          title:
            typeof row.metadata.symbol === "string"
              ? row.metadata.symbol
              : row.filePath,
          excerpt: row.content.slice(0, 1_000),
          reason: row.summary ?? "Repository source matched the search.",
          freshness: null,
          citation: {
            provider: "github" as const,
            repositoryId: row.repositoryId,
            repositoryName: row.repositoryName,
            repositoryOwner: row.repositoryOwner,
            filePath: row.filePath,
            lineStart:
              typeof row.metadata.lineStart === "number"
                ? row.metadata.lineStart
                : null,
            lineEnd:
              typeof row.metadata.lineEnd === "number"
                ? row.metadata.lineEnd
                : null,
            symbol:
              typeof row.metadata.symbol === "string"
                ? row.metadata.symbol
                : null,
            provenance: "indexed_source_chunk" as const,
          },
        };
      });

    return {
      query,
      filters: {
        repositoryId: options.repositoryId ?? null,
        providers: [...providers],
      },
      results: ranked,
      lowConfidence:
        !ranked.length ||
        ((ranked[0]?.score ?? 0) < 0.34 &&
          (ranked[0]?.lexicalMatches ?? 0) === 0),
    };
  }
}
