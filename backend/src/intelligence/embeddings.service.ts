import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import type { Environment } from "../config/environment";

const dimensions = 1536;
const batchSize = 96;
const localNamespace = "atlas-local-embedding-v1";

@Injectable()
export class EmbeddingsService {
  private client?: OpenAI;

  constructor(
    private readonly config: ConfigService<Environment, true>,
  ) {}

  provider(): "local" | "openai" {
    return this.config.get("EMBEDDINGS_PROVIDER", { infer: true });
  }

  async embedTexts(inputs: string[]): Promise<number[][]> {
    if (!inputs.length) return [];
    if (this.provider() === "local") {
      return inputs.map((input) => this.localEmbedding(input));
    }

    const apiKey = this.config.get("OPENAI_API_KEY", { infer: true });
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
    this.client ??= new OpenAI({ apiKey });
    const embeddings: number[][] = [];
    for (let start = 0; start < inputs.length; start += batchSize) {
      const response = await this.client.embeddings.create({
        model: "text-embedding-3-small",
        input: inputs.slice(start, start + batchSize),
        dimensions,
      });
      embeddings.push(
        ...response.data
          .slice()
          .sort((left, right) => left.index - right.index)
          .map((item) => item.embedding),
      );
    }
    return embeddings;
  }

  private localEmbedding(input: string): number[] {
    const result = new Array<number>(dimensions).fill(0);
    const tokens = input
      .toLowerCase()
      .replace(/[^a-z0-9_./-]+/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    for (const token of tokens.length ? tokens : ["empty"]) {
      const digest = createHash("sha256")
        .update(`${localNamespace}:${token}`)
        .digest();
      const index = digest.readUInt32BE(0) % dimensions;
      result[index] += digest[4] % 2 === 0 ? 1 : -1;
    }
    const magnitude =
      Math.sqrt(result.reduce((sum, value) => sum + value * value, 0)) || 1;
    return result.map((value) => Number((value / magnitude).toFixed(8)));
  }
}
