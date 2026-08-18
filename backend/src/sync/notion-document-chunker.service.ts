import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";

const MAX_CHUNK_CHARACTERS = 2_400;
const MAX_DOCUMENT_CHUNKS = 200;

export interface NotionDocumentChunk {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
}

interface ChunkContext {
  resourceId: string;
  title: string;
  url: string | null;
  sourceRevision: string;
  truncated: boolean;
}

interface MarkdownBlock {
  content: string;
  startLine: number;
  endLine: number;
  heading: string | null;
}

export function notionContentHash(markdown: string): string {
  return createHash("sha256").update(markdown).digest("hex");
}

@Injectable()
export class NotionDocumentChunkerService {
  chunk(markdown: string, context: ChunkContext): NotionDocumentChunk[] {
    const blocks = this.blocks(markdown);
    const chunks: MarkdownBlock[] = [];
    let pending: MarkdownBlock | null = null;

    for (const block of blocks) {
      if (
        pending &&
        pending.content.length + block.content.length + 2 <=
          MAX_CHUNK_CHARACTERS
      ) {
        pending = {
          content: `${pending.content}\n\n${block.content}`,
          startLine: pending.startLine,
          endLine: block.endLine,
          heading: block.heading ?? pending.heading,
        };
        continue;
      }
      if (pending) chunks.push(pending);
      pending = block;
    }
    if (pending) chunks.push(pending);

    return chunks.slice(0, MAX_DOCUMENT_CHUNKS).map((chunk, chunkIndex) => ({
      chunkIndex,
      content: chunk.content,
      tokenCount: Math.max(1, Math.ceil(chunk.content.length / 4)),
      metadata: {
        provider: "notion",
        providerResourceId: context.resourceId,
        title: context.title,
        url: context.url,
        heading: chunk.heading,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        sourceRevision: context.sourceRevision,
        truncated: context.truncated,
        documentChunkLimitReached:
          chunks.length > MAX_DOCUMENT_CHUNKS &&
          chunkIndex === MAX_DOCUMENT_CHUNKS - 1,
      },
    }));
  }

  private blocks(markdown: string): MarkdownBlock[] {
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    const blocks: MarkdownBlock[] = [];
    let paragraph: string[] = [];
    let paragraphStart = 1;
    let activeHeading: string | null = null;

    const flush = (endLine: number) => {
      const content = paragraph.join("\n").trim();
      if (content) {
        blocks.push(
          ...this.splitBlock({
            content,
            startLine: paragraphStart,
            endLine,
            heading: activeHeading,
          }),
        );
      }
      paragraph = [];
    };

    for (const [index, line] of lines.entries()) {
      const lineNumber = index + 1;
      if (!line.trim()) {
        flush(Math.max(paragraphStart, lineNumber - 1));
        continue;
      }
      if (!paragraph.length) paragraphStart = lineNumber;
      paragraph.push(line);
      const heading = line.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim();
      if (heading) activeHeading = heading;
    }
    flush(lines.length);
    return blocks;
  }

  private splitBlock(block: MarkdownBlock): MarkdownBlock[] {
    if (block.content.length <= MAX_CHUNK_CHARACTERS) return [block];

    const parts: MarkdownBlock[] = [];
    let remaining = block.content;
    while (remaining.length > MAX_CHUNK_CHARACTERS) {
      const candidate = remaining.slice(0, MAX_CHUNK_CHARACTERS);
      const splitAt = Math.max(
        candidate.lastIndexOf("\n"),
        candidate.lastIndexOf(" "),
      );
      const boundary = splitAt > MAX_CHUNK_CHARACTERS / 2
        ? splitAt
        : MAX_CHUNK_CHARACTERS;
      parts.push({ ...block, content: remaining.slice(0, boundary).trim() });
      remaining = remaining.slice(boundary).trim();
    }
    if (remaining) parts.push({ ...block, content: remaining });
    return parts;
  }
}
