import { describe, expect, it } from "vitest";
import {
  notionContentHash,
  NotionDocumentChunkerService,
} from "../src/sync/notion-document-chunker.service";

const context = {
  resourceId: "notion-page-1",
  title: "Authentication decisions",
  url: "https://notion.so/notion-page-1",
  sourceRevision: "2026-08-12T09:00:00.000Z",
  truncated: false,
};

describe("NotionDocumentChunkerService", () => {
  it("creates bounded Markdown chunks with citation metadata", () => {
    const service = new NotionDocumentChunkerService();
    const markdown = [
      "# Authentication decisions",
      "Use rotating refresh tokens.",
      "",
      "## Operational constraint",
      "x".repeat(5_500),
    ].join("\n");

    const chunks = service.chunk(markdown, context);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.content.length <= 2_400)).toBe(true);
    expect(chunks.every((chunk) => chunk.tokenCount > 0)).toBe(true);
    expect(chunks[0]?.metadata).toMatchObject({
      provider: "notion",
      providerResourceId: context.resourceId,
      title: context.title,
      sourceRevision: context.sourceRevision,
    });
    expect(chunks.at(-1)?.metadata.heading).toBe("Operational constraint");
  });

  it("caps pathological documents at 200 chunks", () => {
    const service = new NotionDocumentChunkerService();
    const markdown = Array.from(
      { length: 220 },
      (_, index) => `## Section ${index}\n${String(index).repeat(2_500)}`,
    ).join("\n\n");

    const chunks = service.chunk(markdown, context);

    expect(chunks).toHaveLength(200);
    expect(chunks.at(-1)?.metadata.documentChunkLimitReached).toBe(true);
  });

  it("uses the full Markdown body for stable content hashes", () => {
    expect(notionContentHash("# Decision\nKeep it.")).toBe(
      notionContentHash("# Decision\nKeep it."),
    );
    expect(notionContentHash("# Decision\nKeep it.")).not.toBe(
      notionContentHash("# Decision\nChange it."),
    );
  });
});
